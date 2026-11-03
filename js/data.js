/*
 * Datos de referencia. Valores aproximados: batería útil (kWh), consumo en
 * carretera (kWh/100 km), potencia máxima de carga AC y DC (kW) y conectores.
 * Todo es editable desde la aplicación; verifica la ficha de tu vehículo.
 */
const EU = ['type2', 'ccs2'];
const US = ['type1', 'ccs1'];

window.EV_VEHICLES = [
  // BYD
  { id: 'byd-dolphin-mini', brand: 'BYD', model: 'Dolphin Mini (38 kWh)', battery: 38, consumption: 14.5, acKw: 6.6, dcKw: 40, connectors: EU },
  { id: 'byd-dolphin-45', brand: 'BYD', model: 'Dolphin (44,9 kWh)', battery: 44.9, consumption: 16, acKw: 7, dcKw: 60, connectors: EU },
  { id: 'byd-dolphin-60', brand: 'BYD', model: 'Dolphin (60,5 kWh)', battery: 60.5, consumption: 16.5, acKw: 11, dcKw: 88, connectors: EU },
  { id: 'byd-yuan-plus', brand: 'BYD', model: 'Yuan Plus / Atto 3', battery: 60.5, consumption: 18, acKw: 7, dcKw: 88, connectors: EU },
  { id: 'byd-seal', brand: 'BYD', model: 'Seal', battery: 82.5, consumption: 18, acKw: 11, dcKw: 150, connectors: EU },
  { id: 'byd-han', brand: 'BYD', model: 'Han EV', battery: 85.4, consumption: 19, acKw: 11, dcKw: 120, connectors: EU },
  { id: 'byd-tang', brand: 'BYD', model: 'Tang EV', battery: 108.8, consumption: 24, acKw: 11, dcKw: 170, connectors: EU },
  // Renault
  { id: 'renault-kwid', brand: 'Renault', model: 'Kwid E-Tech', battery: 26.8, consumption: 13.5, acKw: 7, dcKw: 30, connectors: EU },
  { id: 'renault-zoe', brand: 'Renault', model: 'Zoe (52 kWh)', battery: 52, consumption: 17, acKw: 22, dcKw: 50, connectors: EU },
  { id: 'renault-megane', brand: 'Renault', model: 'Megane E-Tech', battery: 60, consumption: 17, acKw: 7, dcKw: 130, connectors: EU },
  // Nissan
  { id: 'nissan-leaf-40', brand: 'Nissan', model: 'Leaf (40 kWh)', battery: 39, consumption: 17, acKw: 6.6, dcKw: 50, connectors: ['type1', 'chademo'] },
  { id: 'nissan-leaf-62', brand: 'Nissan', model: 'Leaf e+ (62 kWh)', battery: 59, consumption: 18, acKw: 6.6, dcKw: 70, connectors: ['type1', 'chademo'] },
  // Kia
  { id: 'kia-niro', brand: 'Kia', model: 'Niro EV', battery: 64.8, consumption: 17, acKw: 11, dcKw: 80, connectors: EU },
  { id: 'kia-ev3', brand: 'Kia', model: 'EV3 (81 kWh)', battery: 81.4, consumption: 17, acKw: 11, dcKw: 128, connectors: EU },
  { id: 'kia-ev6', brand: 'Kia', model: 'EV6 (77 kWh)', battery: 77.4, consumption: 19, acKw: 11, dcKw: 230, connectors: EU },
  { id: 'kia-ev9', brand: 'Kia', model: 'EV9', battery: 99.8, consumption: 24, acKw: 11, dcKw: 210, connectors: EU },
  // Hyundai
  { id: 'hyundai-kona', brand: 'Hyundai', model: 'Kona Electric (64 kWh)', battery: 64.8, consumption: 16.5, acKw: 11, dcKw: 77, connectors: EU },
  { id: 'hyundai-ioniq5', brand: 'Hyundai', model: 'Ioniq 5 (77 kWh)', battery: 77.4, consumption: 19.5, acKw: 11, dcKw: 230, connectors: EU },
  { id: 'hyundai-ioniq6', brand: 'Hyundai', model: 'Ioniq 6 (77 kWh)', battery: 77.4, consumption: 16.5, acKw: 11, dcKw: 230, connectors: EU },
  // Chevrolet
  { id: 'chevy-bolt', brand: 'Chevrolet', model: 'Bolt EV', battery: 65, consumption: 17, acKw: 11, dcKw: 55, connectors: US },
  { id: 'chevy-bolt-euv', brand: 'Chevrolet', model: 'Bolt EUV', battery: 65, consumption: 17.5, acKw: 11, dcKw: 55, connectors: US },
  { id: 'chevy-equinox', brand: 'Chevrolet', model: 'Equinox EV', battery: 85, consumption: 21, acKw: 11.5, dcKw: 150, connectors: US },
  { id: 'chevy-blazer', brand: 'Chevrolet', model: 'Blazer EV', battery: 85, consumption: 23, acKw: 11.5, dcKw: 190, connectors: US },
  // Tesla
  { id: 'tesla-3-rwd', brand: 'Tesla', model: 'Model 3 RWD (versión CCS2)', battery: 57.5, consumption: 15, acKw: 11, dcKw: 170, connectors: EU },
  { id: 'tesla-3-lr', brand: 'Tesla', model: 'Model 3 Long Range (versión CCS2)', battery: 75, consumption: 15.5, acKw: 11, dcKw: 250, connectors: EU },
  { id: 'tesla-y-rwd', brand: 'Tesla', model: 'Model Y RWD (versión CCS2)', battery: 60, consumption: 16.5, acKw: 11, dcKw: 170, connectors: EU },
  { id: 'tesla-y-lr', brand: 'Tesla', model: 'Model Y Long Range (versión CCS2)', battery: 75, consumption: 17, acKw: 11, dcKw: 250, connectors: EU },
  { id: 'tesla-y-us', brand: 'Tesla', model: 'Model Y importado de EE. UU. (NACS)', battery: 75, consumption: 17, acKw: 11, dcKw: 250, connectors: ['nacs'] },
  // Volvo
  { id: 'volvo-ex30', brand: 'Volvo', model: 'EX30 (64 kWh)', battery: 64, consumption: 17.5, acKw: 11, dcKw: 153, connectors: EU },
  { id: 'volvo-ex40', brand: 'Volvo', model: 'EX40 / XC40 Recharge', battery: 75, consumption: 21, acKw: 11, dcKw: 150, connectors: EU },
  // BMW / Mini
  { id: 'bmw-ix1', brand: 'BMW', model: 'iX1', battery: 64.7, consumption: 18, acKw: 11, dcKw: 130, connectors: EU },
  { id: 'bmw-ix3', brand: 'BMW', model: 'iX3', battery: 74, consumption: 19.5, acKw: 11, dcKw: 150, connectors: EU },
  { id: 'bmw-i4', brand: 'BMW', model: 'i4 eDrive40', battery: 81, consumption: 17.5, acKw: 11, dcKw: 205, connectors: EU },
  { id: 'mini-se', brand: 'Mini', model: 'Cooper SE', battery: 28.9, consumption: 16, acKw: 11, dcKw: 50, connectors: EU },
  // Otros
  { id: 'mercedes-eqa', brand: 'Mercedes-Benz', model: 'EQA', battery: 66.5, consumption: 18.5, acKw: 11, dcKw: 100, connectors: EU },
  { id: 'audi-q4', brand: 'Audi', model: 'Q4 e-tron', battery: 77, consumption: 19.5, acKw: 11, dcKw: 135, connectors: EU },
  { id: 'audi-q8', brand: 'Audi', model: 'Q8 e-tron', battery: 106, consumption: 24, acKw: 11, dcKw: 170, connectors: EU },
  { id: 'porsche-taycan', brand: 'Porsche', model: 'Taycan', battery: 83.7, consumption: 20, acKw: 11, dcKw: 270, connectors: EU },
  { id: 'peugeot-e2008', brand: 'Peugeot', model: 'e-2008', battery: 46, consumption: 17.5, acKw: 7.4, dcKw: 100, connectors: EU },
  { id: 'peugeot-e208', brand: 'Peugeot', model: 'e-208', battery: 46, consumption: 16, acKw: 7.4, dcKw: 100, connectors: EU },
  { id: 'fiat-500e', brand: 'Fiat', model: '500e', battery: 37.3, consumption: 15, acKw: 11, dcKw: 85, connectors: EU },
  { id: 'mg4', brand: 'MG', model: 'MG4 (64 kWh)', battery: 61.7, consumption: 17, acKw: 11, dcKw: 135, connectors: EU },
  { id: 'mg-zs', brand: 'MG', model: 'ZS EV', battery: 68.3, consumption: 19, acKw: 11, dcKw: 92, connectors: EU },
  { id: 'gwm-ora', brand: 'GWM', model: 'Ora 03', battery: 59.3, consumption: 17, acKw: 11, dcKw: 64, connectors: EU },
  { id: 'zeekr-x', brand: 'Zeekr', model: 'X', battery: 64, consumption: 17.5, acKw: 22, dcKw: 150, connectors: EU },
  { id: 'zeekr-001', brand: 'Zeekr', model: '001', battery: 100, consumption: 20, acKw: 22, dcKw: 200, connectors: EU },
  { id: 'ford-mach-e', brand: 'Ford', model: 'Mustang Mach-E (70 kWh)', battery: 70, consumption: 20, acKw: 11, dcKw: 115, connectors: EU }
];

// Ciudades y pueblos frecuentes (coordenadas aproximadas del centro)
window.CO_PLACES = [
  ['Bogotá', 4.7110, -74.0721], ['Medellín', 6.2442, -75.5812], ['Cali', 3.4516, -76.5320],
  ['Barranquilla', 10.9685, -74.7813], ['Cartagena', 10.3910, -75.4794], ['Santa Marta', 11.2408, -74.1990],
  ['Bucaramanga', 7.1193, -73.1227], ['Cúcuta', 7.8939, -72.5078], ['Pereira', 4.8133, -75.6961],
  ['Manizales', 5.0703, -75.5138], ['Armenia', 4.5339, -75.6811], ['Ibagué', 4.4389, -75.2322],
  ['Villavicencio', 4.1420, -73.6266], ['Neiva', 2.9273, -75.2819], ['Tunja', 5.5353, -73.3678],
  ['Pasto', 1.2136, -77.2811], ['Popayán', 2.4448, -76.6147], ['Montería', 8.7479, -75.8814],
  ['Sincelejo', 9.3047, -75.3978], ['Valledupar', 10.4631, -73.2532], ['Riohacha', 11.5444, -72.9072],
  ['Girardot', 4.3032, -74.8034], ['Honda', 5.2088, -74.7360], ['Duitama', 5.8269, -73.0333],
  ['Sogamoso', 5.7145, -72.9339], ['Paipa', 5.7800, -73.1170], ['Rionegro', 6.1551, -75.3737],
  ['Melgar', 4.2047, -74.6407], ['Villa de Leyva', 5.6339, -73.5250], ['San Gil', 6.5550, -73.1340],
  ['Yopal', 5.3378, -72.3959], ['Florencia', 1.6144, -75.6062], ['Tuluá', 4.0847, -76.1954],
  ['Buga', 3.9009, -76.2978], ['Palmira', 3.5394, -76.3036], ['Zipaquirá', 5.0221, -74.0058],
  ['Chía', 4.8619, -74.0326], ['Fusagasugá', 4.3369, -74.3638], ['Guaduas', 5.0697, -74.5978],
  ['Villeta', 5.0128, -74.4728], ['La Dorada', 5.4537, -74.6639], ['Puerto Salgar', 5.4655, -74.6537],
  ['Puerto Boyacá', 5.9769, -74.5891], ['Puerto Triunfo', 5.8730, -74.6400], ['Barrancabermeja', 7.0653, -73.8547],
  ['Aguachica', 8.3084, -73.6166], ['San Alberto', 7.7610, -73.3920], ['Bosconia', 9.9761, -73.8897],
  ['Fundación', 10.5214, -74.1856], ['Ciénaga', 11.0070, -74.2470], ['Caucasia', 7.9865, -75.1932],
  ['Ipiales', 0.8303, -77.6444], ['Girón', 7.0682, -73.1698], ['Floridablanca', 7.0622, -73.0864],
  ['Soacha', 4.5794, -74.2168], ['Envigado', 6.1759, -75.5917], ['Santa Fe de Antioquia', 6.5568, -75.8281]
];
