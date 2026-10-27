# Pathfinder Glass — design reference

- `glass-html/` — HTML source of the Pathfinder Glass screens (exact inline styles). Open in a browser to view; `support.js` is not included, so some interactivity is missing, but layout and styles are all inline.
- `frames/` — PNG exports of the 19 Figma frames (add them here: in Figma select all frames → Export → PNG 1x).
- Figma prototype: https://www.figma.com/design/TfO0HHtU864OIUC6fkAzCf

| HTML file | Figma frame | Route |
|---|---|---|
| Welcome.dc.html | 01 Welcome | /welcome |
| Main.dc.html | 02 Home | / |
| Route.dc.html | 03 Route result (+ 04 What-If ideas) | /route |
| Disruption.dc.html | 05 Disruption detail | /event/[id] |
| Photos.dc.html | 06 / 06b Photos | /event/[id]/photos |
| RouteWork.dc.html | 07 Repairs on route | /route/repairs |
| Nearby.dc.html | 08 Nearby | /nearby |
| Alerts.dc.html | 09 Alerts | /alerts |
| Report.dc.html | 10 Report | /report |
| ReportDone.dc.html | 10b Report sent | /report/done |
| ControlRoom.dc.html | ⚠️ OLD desktop version of 14 — build 14 as the PHONE layout in CLAUDE.md 7.5 | /official |
| FieldUpdate.dc.html | 15 Field update | /official/field/[id] |
| Map.dc.html | shared map look | MapView |

Screens with no HTML file (04, 10c, 11, 12, 13, 14, 14b): follow CLAUDE.md 7.5 and the Figma PNGs.
