const datosInstalacion = {};
let reporteHTML = "";

function showSpinner() {
  document.getElementById("spinner").style.display = "block";
  document.getElementById("mainContainer").classList.add("blur");
  document.body.style.overflow = "hidden";
}
function hideSpinner() {
  document.getElementById("spinner").style.display = "none";
  document.getElementById("mainContainer").classList.remove("blur");
  document.body.style.overflow = "auto";
}

function validateCurrentSection() {
  const currentSection = document.querySelector(".section.active");
  const requiredFields = currentSection.querySelectorAll("input[required], select[required]");
  let allFilled = true;
  
  // Para la sección 1, se requiere además que se ingrese irradiación y que, si se ingresa POTENCIA > 0, HORAS/día sea > 0 (y ≤ 24)
  if (currentSection.id === "section1") {
    const irradiation = document.getElementById("irradiacion").value;
    if (!irradiation || Number(irradiation) <= 0) {
      allFilled = false;
    }
    const tablaCC = document.getElementById("tablaCC");
    const tablaCA = document.getElementById("tablaCA");
    let cargaValida = false;
    [tablaCC, tablaCA].forEach(tabla => {
      for (let i = 1; i < tabla.rows.length; i++) {
        const potencia = parseFloat(tabla.rows[i].cells[1].children[0].value) || 0;
        const horas = parseFloat(tabla.rows[i].cells[2].children[0].value) || 0;
        if (potencia > 0) {
          if (horas > 0 && horas <= 24) {
            cargaValida = true;
          } else {
            allFilled = false;
          }
        }
      }
    });
    if (!cargaValida) {
      allFilled = false;
    }
  } else {
    requiredFields.forEach(field => {
      if (!field.value) {
        allFilled = false;
      }
    });
  }
  
  const btnNext = currentSection.querySelector("button[id^='btnSiguiente'], button[type='submit']");
  if (btnNext) {
    btnNext.disabled = !allFilled;
  }
}

document.querySelectorAll(".section").forEach(section => {
  section.addEventListener("input", validateCurrentSection);
});

document.getElementById("latitud").addEventListener("input", function() {
  validarUbicacion();
  validateCurrentSection();
});
document.getElementById("longitud").addEventListener("input", function() {
  validarUbicacion();
  validateCurrentSection();
});
function validarUbicacion() {
  let lat = document.getElementById("latitud").value;
  let lon = document.getElementById("longitud").value;
  document.getElementById("btnIrradiacion").disabled = !(lat && lon);
  validateCurrentSection();
}

let map, marker;
document.getElementById("btnAbrirMapa").addEventListener("click", function() {
  document.getElementById("mapContainer").style.display = "block";
  if (!map) {
    map = L.map("mapContainer").setView([0, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
    map.on("click", function(e) {
      let lat = e.latlng.lat.toFixed(6);
      let lon = e.latlng.lng.toFixed(6);
      document.getElementById("latitud").value = lat;
      document.getElementById("longitud").value = lon;
      validarUbicacion();
      if (marker) {
        marker.setLatLng(e.latlng);
      } else {
        marker = L.marker(e.latlng).addTo(map);
      }
    });
  }
});

function obtenerUbicacion() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
      let lat = position.coords.latitude.toFixed(6);
      let lon = position.coords.longitude.toFixed(6);
      document.getElementById("latitud").value = lat;
      document.getElementById("longitud").value = lon;
      validarUbicacion();
      if (map) {
        let latlng = [lat, lon];
        map.setView(latlng, 13);
        if (marker) {
          marker.setLatLng(latlng);
        } else {
          marker = L.marker(latlng).addTo(map);
        }
      }
    });
  } else {
    alert("La geolocalización no está disponible en este navegador.");
  }
}

function calcularIrradiacion() {
  let lat = document.getElementById("latitud").value;
  let lon = document.getElementById("longitud").value;
  const btn = document.getElementById("btnIrradiacion");
  const irrField = document.getElementById("irradiacion");
  const cargandoMsg = document.getElementById("cargandoMsg");
  btn.disabled = true;
  cargandoMsg.textContent = "Cargando...";
  
  let url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&start=20240101&end=20241231&format=JSON`;
  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error("La respuesta de NASA POWER no es válida.");
      }
      return response.json();
    })
    .then(data => {
      let param = data.properties.parameter.ALLSKY_SFC_SW_DWN;
      let keys = Object.keys(param);
      if (keys.length > 0) {
        let meses = {};
        keys.forEach(key => {
          let mes = key.substring(4, 6);
          if (!meses[mes]) {
            meses[mes] = { suma: 0, count: 0 };
          }
          meses[mes].suma += param[key];
          meses[mes].count++;
        });
        let irradiacionMensual = [];
        for (let m = 1; m <= 12; m++) {
          let mesStr = m.toString().padStart(2, "0");
          if (meses[mesStr]) {
            let avgMes = (meses[mesStr].suma / meses[mesStr].count).toFixed(2);
            irradiacionMensual.push(avgMes);
          } else {
            irradiacionMensual.push("0");
          }
        }
        let promedioMensual = irradiacionMensual.reduce((sum, val) => sum + parseFloat(val), 0) / irradiacionMensual.length;
        irrField.value = promedioMensual.toFixed(2);
        datosInstalacion.irradiacionMensual = irradiacionMensual;
        datosInstalacion.irradiacion = promedioMensual.toFixed(2);
      } else {
        alert("No se encontraron datos de irradiación en la respuesta de NASA POWER.");
        irrField.value = "";
      }
    })
    .catch(error => {
      alert("Error obteniendo la irradiación: " + error.message);
      console.error(error);
      irrField.value = "";
    })
    .finally(() => {
      btn.disabled = false;
      cargandoMsg.textContent = "";
      validateCurrentSection();
    });
}

function calcularConsumoAutomatico() {
  let totalCC = 0, totalCA = 0;
  const tablaCC = document.getElementById("tablaCC");
  const tablaCA = document.getElementById("tablaCA");
  for (let i = 1; i < tablaCC.rows.length; i++) {
    const potencia = parseFloat(tablaCC.rows[i].cells[1].children[0].value) || 0;
    const horas = parseFloat(tablaCC.rows[i].cells[2].children[0].value) || 0;
    totalCC += potencia * horas;
  }
  document.getElementById("consumoCC").innerText = `Consumo CC: ${totalCC} Wh`;
  for (let i = 1; i < tablaCA.rows.length; i++) {
    const potencia = parseFloat(tablaCA.rows[i].cells[1].children[0].value) || 0;
    const horas = parseFloat(tablaCA.rows[i].cells[2].children[0].value) || 0;
    totalCA += potencia * horas;
  }
  document.getElementById("consumoCA").innerText = `Consumo CA: ${totalCA} Wh`;
  datosInstalacion.totalCargasCC = totalCC;
  datosInstalacion.totalCargasCA = totalCA;
  validateCurrentSection();
}

document.querySelectorAll("#tablaCC input, #tablaCA input").forEach(input => {
  input.addEventListener("input", () => {
    calcularConsumoAutomatico();
  });
});

// Función para agregar una nueva fila a las tablas CC y CA
function agregarFila(tableId, type) {
  const table = document.getElementById(tableId);
  const rowCount = table.rows.length;
  const newRow = table.insertRow(rowCount);
  const cell1 = newRow.insertCell(0);
  const cell2 = newRow.insertCell(1);
  const cell3 = newRow.insertCell(2);
  cell1.innerHTML = `${rowCount}${type}`;
  cell2.innerHTML = '<input type="number" step="any" value="0" required>';
  cell3.innerHTML = '<input type="number" step="any" value="0" max="24" required>';
  // Agregar listener para recalcular el consumo
  newRow.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", calcularConsumoAutomatico);
  });
}

let currentSection = 1;
function nextSection() {
  showSpinner();
  setTimeout(() => {
    if (currentSection === 1) {
      datosInstalacion.latitud = document.getElementById("latitud").value;
      datosInstalacion.longitud = document.getElementById("longitud").value;
    }
    if (currentSection === 2) {
      datosInstalacion.diasAutonomia = document.getElementById("diasAutonomia").value;
      datosInstalacion.tensionSistema = document.getElementById("tensionSistema").value;
      datosInstalacion.tensionPanel = document.getElementById("tensionPanel").value;
      datosInstalacion.corrientePanel = document.getElementById("corrientePanel").value;
      datosInstalacion.potenciaPanel = document.getElementById("potenciaPanel").value;
      datosInstalacion.tensionBaterias = document.getElementById("tensionBaterias").value;
      datosInstalacion.longitudPanelRegulador = document.getElementById("longitudPanelRegulador").value;
      datosInstalacion.longitudReguladorBaterias = document.getElementById("longitudReguladorBaterias").value;
      datosInstalacion.longitudBateriasInversor = document.getElementById("longitudBateriasInversor").value;
    }
    if (currentSection < 6) {
      document.getElementById(`section${currentSection}`).classList.remove("active");
      currentSection++;
      document.getElementById(`section${currentSection}`).classList.add("active");
      validateCurrentSection();
      hideSpinner();
      if (currentSection === 3) {
        mostrarReporte();
      }
    }
  }, 1000);
}

function guardarDetalles(event) {
  event.preventDefault();
  nextSection();
}

function guardarRegulador(event) {
  event.preventDefault();
  datosInstalacion.tensionRegulador = document.getElementById("tensionRegulador").value;
  datosInstalacion.corrienteEntradaRegulador = document.getElementById("corrienteEntradaRegulador").value;
  datosInstalacion.corrienteSalidaRegulador = document.getElementById("corrienteSalidaRegulador").value;
  nextSection();
}

function guardarInversor(event) {
  event.preventDefault();
  datosInstalacion.potenciaMinimaInversor = document.getElementById("potenciaMinimaInversor").value;
  datosInstalacion.tensionCCInversor = document.getElementById("tensionCCInversor").value;
  datosInstalacion.tensionCAInversor = document.getElementById("tensionCAInversor").value;
  nextSection();
}

function guardarFusibles(event) {
  event.preventDefault();
  datosInstalacion.fusiblePanelesRegulador = document.getElementById("fusiblePanelesRegulador").value;
  datosInstalacion.fusibleReguladorBaterias = document.getElementById("fusibleReguladorBaterias").value;
  datosInstalacion.fusibleBateriasInversor = document.getElementById("fusibleBateriasInversor").value;
  alert("Datos guardados correctamente.");
}

function calcularSistema() {
  // Datos básicos del sistema
  const P_sistema = parseFloat(datosInstalacion.potenciaSistema) || 2000; // W
  const V_sistema = parseFloat(datosInstalacion.tensionSistema) || 48; // V

  // Consumo diario (Wh)
  const E_diaria =
    parseFloat(datosInstalacion.consumoDiario) ||
    (parseFloat(datosInstalacion.totalCargasCC) || 0) +
      (parseFloat(datosInstalacion.totalCargasCA) || 0) ||
    2000; // Wh

  // Intensidad en el bus CC del sistema
  const I_sistema = P_sistema / V_sistema;

  // Datos de los paneles
  const V_panel = parseFloat(datosInstalacion.tensionPanel) || 12; // V
  const I_panel = parseFloat(datosInstalacion.corrientePanel) || 5; // A

  // Cálculos para los paneles
  const numPanelesEnSerie = Math.ceil(V_sistema / V_panel);
  const numCadenas = Math.ceil(I_sistema / I_panel);
  const totalPanelesRequeridos = numPanelesEnSerie * numCadenas;
  const corrienteTotalPaneles = I_panel * numCadenas; // en paralelo se suman las corrientes

  // Datos de las baterías
  const V_bateria = parseFloat(datosInstalacion.tensionBaterias) || 12; // V
  const C_bateria = parseFloat(datosInstalacion.capacidadBateria) || 100; // Ah
  const diasAutonomia = parseFloat(datosInstalacion.diasAutonomia) || 4; // C2
  const DoD = parseFloat(datosInstalacion.profundidadDescarga) || 0.85; // C4

  // Aplicación del cálculo correcto de baterías
  const capacidadNominalNecesaria = (E_diaria / V_sistema) * diasAutonomia; // C3
  const capacidadCorregidaBaterias = capacidadNominalNecesaria / DoD; // C5
  const bateriasEnSerie = Math.ceil(V_sistema / V_bateria); // C11
  //correct calculation
  const bateriasEnParalelo = Math.ceil(capacidadCorregidaBaterias/ (C_bateria*bateriasEnSerie));
  
  const totalBaterias = bateriasEnParalelo * bateriasEnSerie;
  const capacidadMinimaPorBateria = C_bateria;

  // Datos del regulador
  const voltajeRegulador = V_sistema;

  // Datos del inversor
  const potenciaInversor = parseFloat(datosInstalacion.potenciaMinimaInversor) || 2000; // VA
  const corrienteEntradaInversor = (potenciaInversor / V_sistema).toFixed(1);
  const voltajeCAInversor = parseFloat(datosInstalacion.tensionCAInversor) || 230;
  const corrienteSalidaInversor = (potenciaInversor / voltajeCAInversor).toFixed(1);

  return {
    // Datos de consumo y paneles
    consumoTotal: E_diaria.toFixed(2), // Consumo diario en Wh
    totalPanelesRequeridos, // Total de paneles (serie x paralelo)
    numPanelesEnSerie, // Paneles en serie
    numCadenas, // Cadenas (paneles en paralelo)
    corrienteTotalPaneles: corrienteTotalPaneles.toFixed(2), // Corriente total de paneles

    // Datos de baterías
    capacidadNominalNecesaria: capacidadNominalNecesaria.toFixed(2), // C3
    capacidadCorregidaBaterias: capacidadCorregidaBaterias.toFixed(2), // C5
    bateriasEnSerie, // C11
    bateriasEnParalelo, // C8
    totalBaterias, // Total de baterías
    capacidadNecesariaAh: capacidadCorregidaBaterias.toFixed(2), // Add this line
    numCadenasBaterias: bateriasEnParalelo, // Add this line
    capacidadMinimaPorBateria: capacidadMinimaPorBateria.toFixed(2), // Add this line
    // Datos de regulador e inversor
    voltajeRegulador, // Tensión del regulador (igual a V_sistema)
    potenciaInversor, // Potencia mínima del inversor (VA)
    corrienteEntradaInversor, // Corriente de entrada del inversor
    voltajeCAInversor, // Tensión CA de salida del inversor
    corrienteSalidaInversor, // Corriente de salida del inversor
  };
}



function mostrarReporte() {
  const resultados = calcularSistema(datosInstalacion);
  let reporteHTML = `
    <p><strong>Irradiación Media Mensual:</strong> ${datosInstalacion.irradiacion || "N/D"} kWh/m²/día</p>
    <p><strong>Detalles del Sistema:</strong></p>
    <ul>
      <li>Inclinación: 30°</li>
      <li>Azimuth: 180°</li>
      <li>Número de días de autonomía: ${datosInstalacion.diasAutonomia || "N/D"}</li>
      <li>Tensión del sistema: ${datosInstalacion.tensionSistema || "N/D"} V</li>
      <li>Tensión del panel: ${datosInstalacion.tensionPanel || "N/D"} V</li>
      <li>Corriente máxima del panel: ${datosInstalacion.corrientePanel || "N/D"} A</li>
      <li>Potencia del panel: ${datosInstalacion.potenciaPanel || "N/D"} W</li>
      <li>Tensión de las baterías: ${datosInstalacion.tensionBaterias || "N/D"} V</li>
      <li>Longitud cable Panel-Regulador: ${datosInstalacion.longitudPanelRegulador || "N/D"} m</li>
      <li>Longitud cable Regulador-Baterías: ${datosInstalacion.longitudReguladorBaterias || "N/D"} m</li>
      <li>Longitud cable Baterías-Inversor: ${datosInstalacion.longitudBateriasInversor || "N/D"} m</li>
      <li>Total Cargas en CC: ${datosInstalacion.totalCargasCC || "N/D"} Wh</li>
      <li>Total Cargas en CA: ${datosInstalacion.totalCargasCA || "N/D"} Wh</li>
    </ul>
    <p><strong>PANELES:</strong></p>
    <ul>
      <li>Consumo diario: ${resultados.consumoTotal} Wh</li>
      <li>Paneles en serie: ${resultados.numPanelesEnSerie}</li>
      <li>Paneles en paralelo: ${resultados.numCadenas}</li>
      <li>Total de paneles: ${resultados.totalPanelesRequeridos}</li>
      <li>Corriente total de los paneles: ${resultados.corrienteTotalPaneles} A</li>
    </ul>
    
    <p><strong>BATERÍAS:</strong></p>
    <ul>
      <li>Capacidad necesaria del banco: ${resultados.capacidadNecesariaAh} Ah</li>
      <li>Baterías en serie: ${resultados.bateriasEnSerie}</li>
      <li>Baterías en paralelo: ${resultados.numCadenasBaterias}</li>
      <li>Total de baterías: ${resultados.totalBaterias}</li>
      <li>Capacidad mínima requerida de cada batería: ${resultados.capacidadMinimaPorBateria} Ah</li>
    </ul>
    
    <p><strong>REGULADOR:</strong></p>
    <ul>
      <li>Tensión: ${resultados.voltajeRegulador} V</li>
      <li>Corriente mínima soportada: ${resultados.corrienteTotalPaneles} A</li>
    </ul>
    
    <p><strong>INVERSOR:</strong></p>
    <ul>
      <li>Potencia mínima: ${resultados.potenciaInversor} VA</li>
      <li>Tensión CC de entrada: ${datosInstalacion.tensionSistema || "N/D"} V</li>
      <li>Tensión CA de salida: ${resultados.voltajeCAInversor} V</li>
      <li>Corriente de entrada: ${resultados.corrienteEntradaInversor} A</li>
      <li>Corriente de salida: ${resultados.corrienteSalidaInversor} A</li>
    </ul>
    
    <p><strong>Irradiación Media Mensual por Mes:</strong></p>
    <ul>`;
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  if (datosInstalacion.irradiacionMensual && datosInstalacion.irradiacionMensual.length === 12) {
    datosInstalacion.irradiacionMensual.forEach((valor, idx) => {
      reporteHTML += `<li>${meses[idx]}: ${valor} kWh/m²/día</li>`;
    });
  } else {
    reporteHTML += `<li>Datos de irradiación no disponibles.</li>`;
  }
  reporteHTML += `</ul>`;
  
  document.getElementById("section3").innerHTML = ` 
    <h3>Reporte del Sistema Fotovoltaico</h3>
    <div id="reporte">${reporteHTML}</div>
    <div class="chart-container">
      <canvas id="graficoIrradiacion"></canvas>
    </div>
    <button onclick="abrirModalEmpresa()">Generar Presupuesto</button>
    <button onclick="generarFichaTecnica()">Generar Ficha Técnica</button> 
  `;
  document.getElementById("section3").classList.add("active");
  
  const ctx = document.getElementById("graficoIrradiacion").getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: meses,
      datasets: [{
        label: "Irradiación (kWh/m²/día)",
        data: datosInstalacion.irradiacionMensual || Array(12).fill(0),
        fill: false,
        borderColor: "#007BFF",
        tension: 0.1
      }]
    },
    options: {
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function generarFichaTecnica() {
  const username = localStorage.getItem('username') || "Usuario no registrado";
  const resultados = calcularSistema();

  const doc = new window.jspdf.jsPDF();

  // Styles
  const defaultStyle = { font: "helvetica", fontSize: 10, textColor: 0 };
  const titleStyle = { ...defaultStyle, fontSize: 20, textColor: "#0066CC" };


  doc.setFont(defaultStyle.font);
  doc.setFontSize(defaultStyle.fontSize);

  // Title and User
  doc.setFontSize(titleStyle.fontSize);
  doc.setTextColor(titleStyle.textColor);
  doc.text('Ficha Técnica', 10, 20);

  doc.setFontSize(defaultStyle.fontSize);
  doc.setTextColor(defaultStyle.textColor);
  doc.text(`Vendedor: ${username} - Fecha: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 10, 30);

  let y = 40; // Initial vertical position

  function addDataSection(title, data) {
      doc.setFontSize(12).setFont(defaultStyle.font, 'normal').text(title, 10, y); // Title is bold
      y += 6;

      for (const key in data) {
          if (typeof data[key] === 'object' && data[key] !== null) {
              doc.setFontSize(defaultStyle.fontSize).setFont(defaultStyle.font); // Reset to default for nested data
              doc.text(`${key}:`, 10, y);
              y += 5;
              for (let i = 0; i < data[key].length; i++) {
                  const innerKey = Array.isArray(data[key]) ? i : Object.keys(data[key])[i];
                  const innerValue = Array.isArray(data[key]) ? data[key][i] : data[key][innerKey];
                  doc.text(`- ${innerKey}: ${innerValue}`, 15, y);
                  y += 5;
              }
          } else {
              doc.setFontSize(defaultStyle.fontSize).setFont(defaultStyle.font); // Reset to default before each item
              doc.text(`${key}: ${data[key]}`, 10, y);
              y += 5;
          }
      }
      y += 5; // Add spacing between sections
  }

  addDataSection('Detalles del Sistema', {
      'Irradiación Media Mensual': `${datosInstalacion.irradiacion || "N/D"} kWh/m²/día`,
      'Inclinación': `30°`,
      'Azimuth': `180°`,
      'Número de días de autonomía': `${datosInstalacion.diasAutonomia || "N/D"}`,
      'Tensión del sistema': `${datosInstalacion.tensionSistema || "N/D"} V`,
      'Tensión del panel': `${datosInstalacion.tensionPanel || "N/D"} V`,
      'Corriente máxima del panel': `${datosInstalacion.corrientePanel || "N/D"} A`,
      'Potencia del panel': `${datosInstalacion.potenciaPanel || "N/D"} W`,
      'Tensión de las baterías': `${datosInstalacion.tensionBaterias || "N/D"} V`,
      'Longitud cable Panel-Regulador': `${datosInstalacion.longitudPanelRegulador || "N/D"} m`,
      'Longitud cable Regulador-Baterías': `${datosInstalacion.longitudReguladorBaterias || "N/D"} m`,
      'Longitud cable Baterías-Inversor': `${datosInstalacion.longitudBateriasInversor || "N/D"} m`,
      'Total Cargas en CC': `${datosInstalacion.totalCargasCC || "N/D"} Wh`,
      'Total Cargas en CA': `${datosInstalacion.totalCargasCA || "N/D"} Wh`,
  });

  addDataSection('PANELES', {
      'Consumo diario (Wh)': resultados.consumoTotal,
      'Número total de paneles requeridos': resultados.totalPanelesRequeridos,
      'Paneles en serie': resultados.numPanelesEnSerie,
      'Paneles en paralelo': resultados.numCadenas,
      'Corriente total de los paneles': `${resultados.corrienteTotalPaneles} A`,
  });

  addDataSection('BATERÍAS', {
    'Capacidad necesaria del banco': `${resultados.capacidadNecesariaAh} Ah`,
    'Baterías en serie': resultados.bateriasEnSerie, // No es un string
    'Baterías en paralelo': resultados.numCadenasBaterias, // No es un string
    'Total de baterías': resultados.totalBaterias, // No es un string
    'Capacidad mínima requerida de cada batería': `${resultados.capacidadMinimaPorBateria} Ah`,
  });

  addDataSection('REGULADOR', {
    'Tensión': `${resultados.voltajeRegulador} V`,
    'Corriente mínima soportada': `${resultados.corrienteTotalPaneles} A`,
  });

  addDataSection('INVERSOR', {
    'Potencia mínima': `${resultados.potenciaInversor} VA`,
    'Tensión CC de entrada': `${datosInstalacion.tensionSistema || "N/D"} V`,
    'Tensión CA de salida': `${resultados.voltajeCAInversor} V`,
    'Corriente de entrada': `${resultados.corrienteEntradaInversor} A`,
    'Corriente de salida': `${resultados.corrienteSalidaInversor} A`,
  });

  doc.addPage();
  const canvas = document.getElementById("graficoIrradiacion");
  if (canvas) {
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = 180; // Adjust width as needed
      const imgHeight = canvas.height * imgWidth / canvas.width; // Maintain aspect ratio
      doc.addImage(imgData, 'PNG', 10, 15, imgWidth, imgHeight);
  }


  // ... (Add similar addDataSection calls for BATERÍAS, REGULADOR, INVERSOR, and Irradiación)
  
//Irradiación Media Mensual por Mes
    function agregarFooter() {
        doc.setFontSize(8); // Smaller font size for the footer
        doc.setTextColor(defaultStyle.textColor);
        doc.text("Desarrollado por Miquel Suriñach Mondelo", 10, doc.internal.pageSize.height - 10);
    }

  agregarFooter();
  doc.save("FichaTecnica_ElectricTools.pdf");
}

function abrirModalEmpresa() {
  document.getElementById("modalEmpresa").style.display = "block";
  document.body.style.overflow = "hidden";
  document.getElementById('nombreVendedor').value = localStorage.getItem('username') || ''; 
}

function cerrarModalEmpresa() {
  document.getElementById("modalEmpresa").style.display = "none";
  document.body.style.overflow = "auto";
}

// Evento para el botón personalizado de subir logo
document.getElementById("btnSubirLogo").addEventListener("click", function() {
  document.getElementById("logoEmpresa").click();
});

// Evento para el botón de remover logo
document.getElementById("btnRemoverLogo").addEventListener("click", function() {
  document.getElementById("logoEmpresa").value = "";
  const preview = document.getElementById("logoPreview");
  preview.src = "";
  preview.style.display = "none";
  // Opcional: también ocultar el botón de remover logo
  document.getElementById("btnRemoverLogo").style.display = "none";
});

// Mostrar preview del logo cuando se seleccione el archivo
document.getElementById("logoEmpresa").addEventListener("change", function(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const preview = document.getElementById("logoPreview");
      preview.src = e.target.result;
      preview.style.display = "inline-block";
      // Mostrar el botón de remover logo
      document.getElementById("btnRemoverLogo").style.display = "inline-block";
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById("formModalEmpresa").addEventListener("submit", function(e) {
  e.preventDefault();
  const empresa = document.getElementById("nombreEmpresa").value;
  const vendedor = document.getElementById("nombreVendedor").value;
  const cliente = document.getElementById("nombreCliente").value;
  const logoFile = document.getElementById("logoEmpresa").files[0];
  if (logoFile) {
    obtenerLogoBase64(logoFile, function(logoBase64) {
      cerrarModalEmpresa();
      generarPresupuestoConDatos(empresa, vendedor, cliente, logoBase64);
    });
  } else {
    cerrarModalEmpresa();
    generarPresupuestoConDatos(empresa, vendedor, cliente, null);
  }
});

function obtenerLogoBase64(file, callback) {
  const reader = new FileReader();
  reader.onload = function(e) {
    callback(e.target.result);
  };
  reader.readAsDataURL(file);
}

function generarPresupuestoConDatos(empresa, vendedor, cliente, logoBase64) {
  showSpinner();
  const precioPanel = 150;
  const precioBateria = 100;
  const precioRegulador = 200;
  const precioInversor = 300;
  const precioCablePorMetro = 1;
  
  const resultados = calcularSistema();
  
  const precioTotalPaneles = resultados.totalPanelesRequeridos * precioPanel;
  const precioTotalBaterias = resultados.totalBaterias * precioBateria;
  const precioTotalCables = (
    parseFloat(datosInstalacion.longitudPanelRegulador) +
    parseFloat(datosInstalacion.longitudReguladorBaterias) +
    parseFloat(datosInstalacion.longitudBateriasInversor)
  ) * precioCablePorMetro;
  const precioTotalRegulador = precioRegulador;
  const precioTotalInversor = precioInversor;
  
  const subtotal = precioTotalPaneles + precioTotalBaterias + precioTotalCables + precioTotalRegulador + precioTotalInversor;
  const iva = subtotal * 0.21;
  const totalConIVA = subtotal + iva;
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 10;
  
  function agregarFooter() {
    doc.setFontSize(10);
    doc.text("Desarollado por Miquel Suriñach Mondelo", 10, doc.internal.pageSize.height - 10);
  }
  
  // Encabezado formal tipo factura con recuadro
  doc.setFillColor(240,240,240);
  doc.rect(10, 8, 190, 45, 'F');
  doc.setDrawColor(0);
  doc.rect(10, 8, 190, 45);
  
  doc.setFontSize(16);
  doc.setTextColor(0, 102, 204);
  doc.text("Presupuesto del Sistema Fotovoltaico Autonomo", 12, 20);
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Empresa: ${empresa}`, 12, 28);
  doc.text(`Vendedor: ${vendedor}`, 12, 34);
  doc.text(`Cliente: ${cliente}`, 12, 40);
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', 150, 12, 40, 35);
  }
  doc.text("Fecha: " + new Date().toLocaleDateString(), 12, 48);
  y = 60;
  
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(10, y, 190, 30);
  doc.setFontSize(12);
  doc.text("Resumen del Sistema:", 12, y + 8);
  doc.setFontSize(11);
  doc.text(`Consumo diario: ${resultados.consumoTotal} Wh`, 12, y + 14);
  doc.text(`Paneles: ${resultados.totalPanelesRequeridos}`, 12, y + 20);
  doc.text(`Baterías: ${resultados.totalBaterias}`, 110, y + 14);
  doc.text(`Corriente: ${resultados.corrienteTotalPaneles} A`, 110, y + 20);
  y += 36;
  agregarFooter();
  
  doc.autoTable({
    startY: y,
    head: [["Componente", "Cantidad", "Precio Unitario (€)", "Total (€)"]],
    body: [
      ["Paneles", resultados.totalPanelesRequeridos, precioPanel.toFixed(2), precioTotalPaneles.toFixed(2)],
      ["Baterías", resultados.totalBaterias, precioBateria.toFixed(2), precioTotalBaterias.toFixed(2)],
      ["Cables (m)", 
       (parseFloat(datosInstalacion.longitudPanelRegulador) +
        parseFloat(datosInstalacion.longitudReguladorBaterias) +
        parseFloat(datosInstalacion.longitudBateriasInversor)).toFixed(2), 
       precioCablePorMetro.toFixed(2), 
       precioTotalCables.toFixed(2)],
      ["Regulador", 1, precioRegulador.toFixed(2), precioTotalRegulador.toFixed(2)],
      ["Inversor", 1, precioInversor.toFixed(2), precioTotalInversor.toFixed(2)]
    ],
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [0, 102, 204] },
    margin: { top: y, left: 10, right: 10 },
    didDrawPage: function (data) {
      agregarFooter();
    }
  });
  
  y = doc.lastAutoTable.finalY + 4;
  
  doc.autoTable({
    startY: y,
    head: [["Subtotal", "IVA (21%)", "Total con IVA"]],
    body: [[`€ ${subtotal.toFixed(2)}`, `€ ${iva.toFixed(2)}`, `€ ${totalConIVA.toFixed(2)}`]],
    theme: 'grid',
    styles: { fontSize: 12, halign: 'center' },
    headStyles: { fillColor: [0, 102, 204] },
    margin: { left: 10, right: 10 },
    didDrawPage: function (data) {
      agregarFooter();
    }
  });
  
  y = doc.lastAutoTable.finalY + 6;
  
  doc.setFontSize(16);
  doc.text("Gráfico de Irradiación Mensual", 12, y);
  y += 8;
  const canvas = document.getElementById("graficoIrradiacion");
  if (canvas) {
    const imgData = canvas.toDataURL("image/png");
    doc.addImage(imgData, 'PNG', 12, y, 180, 80);
  }
  agregarFooter();
  
  hideSpinner();
  doc.save("Presupuesto_ElectricTools.pdf");
}

document.addEventListener('DOMContentLoaded', function() {
  // ... (Your existing JavaScript code)

  const savedUsername = localStorage.getItem('username');
  const usernameDisplay = document.querySelector('.username');
  const clickableTitle = document.getElementById('clickableTitle');
  const usernameInput = document.getElementById('username');
  const loginModal = document.getElementById('loginModal');
  const modalBackdrop = document.getElementById('modalBackdrop');


  function showLoginModal() {
      modalBackdrop.style.display = "block";
      loginModal.style.display = "block";
  }


  function showWelcomeMessage(username) {
      usernameDisplay.textContent = "¡Hola, " + username + "!"; // Display after welcome screen
  }


  function saveUsername() {
      const username = usernameInput.value.trim();
      if (username) {
          localStorage.setItem('username', username);
          loginModal.style.display = "none";
          modalBackdrop.style.display = "none";
          showWelcomeMessage(username);
      } else {
          alert("Por favor, introduce tu nombre.")
      }
  }


  if (savedUsername) {
      showWelcomeMessage(savedUsername);
  } else {
      showLoginModal();
  }

  // Event listeners
  document.querySelector('#loginModal button').addEventListener('click', saveUsername);
  clickableTitle.addEventListener('click', function() {
      window.location.href = '../index.html'; // Updated path
  });
  
	usernameDisplay.addEventListener('click', function() {
		window.location.href = '../settings.html'; // Open settings.html
	});
});

