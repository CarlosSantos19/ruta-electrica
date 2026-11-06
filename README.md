# Ruta Eléctrica Colombia

Aplicación web para planear viajes en carro eléctrico por Colombia: calcula la ruta, elige
las paradas de carga compatibles con tu vehículo y estima el tiempo de cada carga, la hora
de llegada y el costo.

## Cómo abrirla

1. Doble clic en **`iniciar.bat`** (necesita Python instalado).
2. Se abre el navegador en <http://localhost:8080>.

También puedes compartir enlaces que planean el viaje de una vez, por ejemplo:
`http://localhost:8080/?origen=Bogotá&destino=Barranquilla&carro=kia-ev6&bateria=90`

## Qué hace

- **Vehículo:** 47 modelos con batería, consumo, potencia AC/DC y conectores. Todos los
  valores se pueden editar.
- **Ruta:** origen, destino y una parada intermedia opcional. Se escriben o se marcan en el
  mapa. Muestra hasta 3 rutas alternativas.
- **Paradas óptimas:** busca la combinación de cargadores que da el **menor tiempo total**
  (manejo + carga + desvío). Respeta la batería mínima de llegada y la carga máxima que elijas.
- **Tiempo de carga:** usa una curva realista, con carga más lenta por encima del 80 % en DC,
  y la potencia limitada por el carro y por el cargador.
- **Resultados:** itinerario con horas, gráfico de batería, energía, costo estimado y botón
  para abrir la ruta en Google Maps.
- **Mapa:** paradas numeradas, cargadores compatibles (verde) y no compatibles (gris).
- **Cargadores propios:** agrega los que conozcas, como hoteles o fincas.
- **Viajes guardados:** quedan en este navegador.

## Fuentes de datos

| Fuente | Notas |
|---|---|
| OpenStreetMap (Overpass) | Automática y gratuita. Incluye una copia de respaldo (`js/osm-snapshot.js`). Muchas estaciones no tienen datos de conector. |
| Open Charge Map | Opcional. Crea una clave gratis en openchargemap.org y pégala en la sección "Cargadores". |
| Cargadores propios | Los que agregues tú. |
| OSRM / Nominatim | Rutas y búsqueda de lugares (servidores públicos gratuitos). |

Las estaciones Terpel Voltex sin conectores registrados se asumen de 40 kW DC (CCS1, CCS2,
CHAdeMO, GB/T) y se marcan como **“sin verificar”**. Las demás estaciones sin datos se asumen
como carga lenta de 7 kW.

**Importante:** los datos son abiertos y pueden estar desactualizados. Confirma cada parada
en la app del operador antes de salir.

## Archivos

- `index.html`, `css/styles.css`: interfaz
- `js/planner.js`: motor de cálculo (sin dependencias, se puede probar con Node)
- `js/services.js`: rutas, lugares y cargadores
- `js/data.js`: vehículos y ciudades
- `js/osm-snapshot.js`: copia de respaldo de los cargadores de OpenStreetMap
