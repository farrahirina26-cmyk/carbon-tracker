document.addEventListener('DOMContentLoaded', () => {
  let globalCommuteLogs = [];
  let globalHomeLogs = [];

  const startInput = document.getElementById('startPoint');
  const destInput = document.getElementById('destination');
  const transportSelect = document.getElementById('transportType');
  const distanceInput = document.getElementById('distance');
  const logoutBtn = document.getElementById('logoutBtn');

  const transportFactors = { 'Walking': 0.8, 'Rickshaw': 0.9, 'Bus': 1.2, 'Car': 1.0, 'CNG': 1.1 };
  const emissionFactors = { 
  'Walking': 0.0, 
  'Rickshaw': 0.0, 
  'Train': 0.035, // প্রতি কিলোমিটারে প্রতি যাত্রীর জন্য প্রায় ০.০৩৫ কেজি CO2
  'Bus': 0.08, 
  'Car': 0.21, 
  'CNG': 0.05, 
  'Aeroplane': 0.18 
};

  // --- Custom Alert Helper Function ---
  function showCustomAlert(message) {
    const existingAlert = document.getElementById('customFloatingAlert');
    if (existingAlert) existingAlert.remove();

    const alertBox = document.createElement('div');
    alertBox.id = 'customFloatingAlert';
    alertBox.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      background-color: #dc3545;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 0.9rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: opacity 0.3s ease;
    `;
    alertBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-2"></i> ${message}`;

    document.body.appendChild(alertBox);

    setTimeout(() => {
      alertBox.style.opacity = '0';
      setTimeout(() => alertBox.remove(), 300);
    }, 3000);
  }

  // --- Fetch Logged-in User Name & Dashboard Data ---
  async function initDashboard() {
    await fetchLoggedInUser();
    await fetchDashboardData();
  }

  async function fetchLoggedInUser() {
    try {
      const savedName = localStorage.getItem('userName');
      const welcomeEl = document.getElementById('welcomeUser') || document.getElementById('welcomeUserName');
      
      if (savedName && welcomeEl) {
        welcomeEl.innerText = `Welcome, ${savedName}`;
      }

      const res = await fetch('/api/user');
      if (res.ok) {
        const userData = await res.json();
        const userName = userData.name || userData.username || 'User';
        
        if (welcomeEl) {
          welcomeEl.innerText = `Welcome, ${userName}`;
        }
        localStorage.setItem('userName', userName);
      } else {
        window.location.href = '/login.html';
      }
    } catch (err) {
      console.error('Error fetching user:', err);
    }
  }

  async function fetchDashboardData() {
    try {
      const commuteRes = await fetch('/api/commute-logs');
      if (commuteRes.ok) {
        const commuteData = await commuteRes.json();
        globalCommuteLogs = commuteData.map(item => ({
          id: item.id,
          startPoint: item.start_point,
          destination: item.destination,
          transportType: item.transport_type,
          distance: `${item.distance_km} KM`,
          co2Emission: item.carbon_emission_kg,
          date: item.created_at ? item.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
        }));
      }

      const homeRes = await fetch('/api/home-logs');
      if (homeRes.ok) {
        const homeData = await homeRes.json();
        globalHomeLogs = homeData.map(item => ({
          id: item.id,
          lightCount: item.lights_count, lightHours: item.light_hours || 0,
          fanCount: item.fans_count, fanHours: item.fan_hours || 0,
          acCount: item.ac_count, acHours: item.ac_hours || 0,
          deviceCount: item.devices_count, deviceHours: item.device_hours || 0,
          co2Emission: item.total_home_carbon_kg,
          date: item.created_at ? item.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
        }));
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
    renderAndCalculateAll();
  }

  function renderAndCalculateAll() {
    renderCommuteTable(globalCommuteLogs);
    renderHomeTable(globalHomeLogs);
    calculateStats(globalCommuteLogs, globalHomeLogs);
  }

  // --- Auto Calculate Distance ---
  async function autoCalculateDistance() {
    const start = startInput ? startInput.value.trim() : '';
    const dest = destInput ? destInput.value.trim() : '';
    const transport = transportSelect ? transportSelect.value : 'Bus';

    if (start.length > 0 && dest.length > 0) {
      try {
        distanceInput.value = 'Auto calculating...';
        
        const startCoords = await getCoordinates(start);
        const destCoords = await getCoordinates(dest);

        if (!startCoords || !destCoords) {
          distanceInput.value = 'Location not found';
          return;
        }

        const url = `https://router.project-osrm.org/route/v1/driving/${startCoords.lng},${startCoords.lat};${destCoords.lng},${destCoords.lat}?overview=false`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          let distanceInKm = data.routes[0].distance / 1000;
          
          if (distanceInKm > 500) {
            distanceInKm = 25;
          }

          distanceInput.value = `${distanceInKm.toFixed(2)} KM`;
        } else {
          distanceInput.value = '0 KM';
        }
      } catch (error) {
        distanceInput.value = 'Error calculating';
      }
    } else {
      distanceInput.value = '';
    }
  }

  async function getCoordinates(query) {
    let searchQuery = query.toLowerCase().includes('bangladesh') ? query : `${query}, Bangladesh`;
    
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=bd`);
    const data = await response.json();
    
    if (data && data.length > 0) {
      return { lat: data[0].lat, lng: data[0].lon };
    }

    return null;
  }

  if (startInput && destInput && transportSelect) {
    ['change', 'blur'].forEach(evt => {
      startInput.addEventListener(evt, autoCalculateDistance);
      destInput.addEventListener(evt, autoCalculateDistance);
      transportSelect.addEventListener(evt, autoCalculateDistance);
    });
  }

  // --- Render Tables & Delete Handlers ---
  function renderCommuteTable(logs) {
    const tbody = document.getElementById('commuteTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No commute history found.</td></tr>`;
      return;
    }

    logs.forEach((log) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${log.date}</td>
        <td>${log.startPoint} &rarr; ${log.destination}</td>
        <td><span class="badge bg-secondary">${log.transportType}</span></td>
        <td>${log.distance}</td>
        <td class="text-danger fw-bold">${log.co2Emission} kg</td>
        <td><button class="btn btn-outline-danger btn-sm delete-commute-btn" data-id="${log.id}"><i class="fa-solid fa-trash"></i></button></td>
      `;
      tbody.appendChild(row);
    });

    document.querySelectorAll('.delete-commute-btn').forEach(button => {
      button.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const id = btn.getAttribute('data-id');
        
        if (!id || id === 'undefined' || id === 'null') {
          btn.closest('tr').remove();
          return;
        }

        try {
          const response = await fetch(`/api/commute-logs/${id}`, { method: 'DELETE' });
          if (response.ok) {
            fetchDashboardData();
          } else {
            console.error('Server failed to delete log');
            showCustomAlert('ডিলিট করতে সমস্যা হয়েছে। সার্ভার রেসপন্স করেনি।');
          }
        } catch (err) {
          console.error('Failed to delete commute log', err);
        }
      });
    });
  }

  function renderHomeTable(logs) {
    const tbody = document.getElementById('homeTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No home footprint history found.</td></tr>`;
      return;
    }

    logs.forEach((log) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${log.date}</td>
        <td>${log.lightCount || 0} (${log.lightHours || 0}h)</td>
        <td>${log.fanCount || 0} (${log.fanHours || 0}h)</td>
        <td>${log.acCount || 0} (${log.acHours || 0}h)</td>
        <td>${log.deviceCount || 0} (${log.deviceHours || 0}h)</td>
        <td class="text-danger fw-bold">${log.co2Emission} kg</td>
        <td><button class="btn btn-outline-danger btn-sm delete-home-btn" data-id="${log.id}"><i class="fa-solid fa-trash"></i></button></td>
      `;
      tbody.appendChild(row);
    });

    document.querySelectorAll('.delete-home-btn').forEach(button => {
      button.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const id = btn.getAttribute('data-id');
        
        if (!id || id === 'undefined' || id === 'null') {
          btn.closest('tr').remove();
          return;
        }

        try {
          const response = await fetch(`/api/home-logs/${id}`, { method: 'DELETE' });
          if (response.ok) {
            fetchDashboardData();
          } else {
            console.error('Server failed to delete home log');
          }
        } catch (err) {
          console.error('Failed to delete home log', err);
        }
      });
    });
  }

  // --- Statistics Calculation ---
  function calculateStats(commuteLogs, homeLogs) {
    const todayDate = new Date().toISOString().split('T')[0];

    const todayCommuteList = (commuteLogs || []).filter(log => log.date === todayDate);
    let todayCommuteCO2 = todayCommuteList.reduce((acc, curr) => acc + parseFloat(curr.co2Emission || 0), 0);
    localStorage.setItem('commuteLogs', JSON.stringify(todayCommuteList));

    const todayHomeList = (homeLogs || []).filter(log => log.date === todayDate);
    let todayHomeCO2 = todayHomeList.reduce((acc, curr) => acc + parseFloat(curr.co2Emission || 0), 0);
    localStorage.setItem('homelogs', JSON.stringify(todayHomeList));

    const todayGrandTotalCO2 = todayCommuteCO2 + todayHomeCO2;

    const allCommuteCO2 = (commuteLogs || []).reduce((acc, curr) => acc + parseFloat(curr.co2Emission || 0), 0);
    const allHomeCO2 = (homeLogs || []).reduce((acc, curr) => acc + parseFloat(curr.co2Emission || 0), 0);
    const absoluteGrandTotalCO2 = allCommuteCO2 + allHomeCO2;

    if (document.getElementById('todayCommuteCO2')) document.getElementById('todayCommuteCO2').innerText = todayCommuteCO2.toFixed(2);
    if (document.getElementById('todayHomeCO2')) document.getElementById('todayHomeCO2').innerText = todayHomeCO2.toFixed(2);

    // --- Realistic Eco Score Calculation ---
    const dailyStandardLimit = 15.0; // আদর্শ দৈনিক লিমিট (১৫ কেজি CO2)
    let score = 100 - Math.round((todayGrandTotalCO2 / dailyStandardLimit) * 50);
    
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    if (document.getElementById('ecoScore')) document.getElementById('ecoScore').innerText = score;
    if (document.getElementById('totalTrips')) document.getElementById('totalTrips').innerText = (commuteLogs || []).length;
    if (document.getElementById('totalCO2')) document.getElementById('totalCO2').innerText = absoluteGrandTotalCO2.toFixed(2);

    localStorage.setItem('totalUserCO2', absoluteGrandTotalCO2.toFixed(2));
  }

  const commuteForm = document.getElementById('commuteForm');
  if (commuteForm) {
    commuteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const start = startInput.value.trim();
      const dest = destInput.value.trim();
      const transport = transportSelect.value;
      
      const rawDistValue = distanceInput.value.replace(/[^0-9.]/g, '');
      const distNum = parseFloat(rawDistValue) || 0;

      if (distNum <= 0) {
        showCustomAlert('Please wait for distance calculation or enter valid locations!');
        return;
      }

      const co2 = (distNum * (emissionFactors[transport] || 0.08)).toFixed(2);

      try {
        await fetch('/api/commute-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startPoint: start, destination: dest, transportType: transport, distance: distNum, co2Emission: co2 })
        });
        commuteForm.reset();
        distanceInput.value = '';
        fetchDashboardData();
      } catch (err) {
        console.error('Failed to save commute log', err);
      }
    });
  }

  const homeForm = document.getElementById('homeForm');
  if (homeForm) {
    homeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const lightCount = parseFloat(document.getElementById('lightCount').value) || 0;
      const lightHours = parseFloat(document.getElementById('lightHours').value) || 0;
      const fanCount = parseFloat(document.getElementById('fanCount').value) || 0;
      const fanHours = parseFloat(document.getElementById('fanHours').value) || 0;
      const acCount = parseFloat(document.getElementById('acCount').value) || 0;
      const acHours = parseFloat(document.getElementById('acHours').value) || 0;
      const deviceCount = parseFloat(document.getElementById('deviceCount').value) || 0;
      const deviceHours = parseFloat(document.getElementById('deviceHours').value) || 0;

      const lightEmission = lightCount * lightHours * 0.01;
      const fanEmission = fanCount * fanHours * 0.03;
      const acEmission = acCount * acHours * 1.2;
      const deviceEmission = deviceCount * deviceHours * 0.1;

      const totalCO2 = (lightEmission + fanEmission + acEmission + deviceEmission).toFixed(2);

      const payload = {
        lightCount,
        lightHours,
        fanCount,
        fanHours,
        acCount,
        acHours,
        deviceCount,
        deviceHours,
        co2Emission: totalCO2
      };

      try {
        await fetch('/api/home-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        homeForm.reset();
        fetchDashboardData();
      } catch (err) {
        console.error('Failed to save home log', err);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch('/logout');
      } finally {
        window.location.href = '/login.html';
      }
    });
  }

  const searchTransportInput = document.querySelector('input[placeholder="Search transport..."]');
  const filterDateInput = document.querySelector('input[type="date"]');

  function filterCommuteTable() {
    const transportQuery = searchTransportInput ? searchTransportInput.value.toLowerCase().trim() : '';
    const dateQuery = filterDateInput ? filterDateInput.value : '';

    const filteredLogs = globalCommuteLogs.filter(log => {
      const matchesTransport = log.transportType.toLowerCase().includes(transportQuery);
      const matchesDate = dateQuery === '' || log.date === dateQuery;
      return matchesTransport && matchesDate;
    });

    renderCommuteTable(filteredLogs);
  }

  if (searchTransportInput) {
    searchTransportInput.addEventListener('input', filterCommuteTable);
  }
  if (filterDateInput) {
    filterDateInput.addEventListener('change', filterCommuteTable);
  }

  const homeSearchInput = document.getElementById('homeDateFilter');
  if (homeSearchInput) {
      homeSearchInput.addEventListener('change', (e) => {
          const query = e.target.value.trim();
          if (!query) {
              renderHomeTable(globalHomeLogs);
              return;
          }
          const filteredLogs = globalHomeLogs.filter(log => {
              return log.date.includes(query);
          });
          renderHomeTable(filteredLogs);
      });
  }

  initDashboard();
});

// Plus and Minus button logic for home footprint counters
function increment(id) {
    const input = document.getElementById(id);
    if (input) {
        input.value = parseInt(input.value || 0) + 1;
    }
}

function decrement(id) {
    const input = document.getElementById(id);
    if (input) {
        let val = parseInt(input.value || 0);
        if (val > 0) {
            input.value = val - 1;
        }
    }
}

// সব পেজের সাইডবারে ইউজারের ইমেইল ডাইনামিকালি সেট করার কোড
document.addEventListener("DOMContentLoaded", function () {
  let userEmailSpan = document.getElementById('userEmailText');
  let savedEmail = localStorage.getItem('userEmail') || localStorage.getItem('email') || "user@gmail.com";
  
  if (userEmailSpan) {
    userEmailSpan.innerText = savedEmail;
  }
});