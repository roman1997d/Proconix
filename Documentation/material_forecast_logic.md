# Forecast: „Forecasted usage this week” și „Usage last week”

## Ce afișează acum UI-ul

- **Forecasted usage this week** – un număr (estimare consum în săptămâna curentă).
- **Usage last week** – un număr (consum real în săptămâna trecută).
- Grafic: bară „Last week (actual)”, bară „This week (forecast)”.
- Alertă: dacă **forecast this week > stoc total rămas** pe proiect → „Consider reordering”.

Toate sunt **per proiect** (proiectul ales în dropdown).

---

## De ce acum sunt 0

Backend-ul la `GET /api/materials/forecast?projectId=...` returnează mereu:

`{ thisWeek: 0, lastWeek: 0 }`.

În baza de date **nu există încă nicio informație despre consum pe perioade** (săptămâni). Avem doar:

- În `materials`: `quantity_used`, `quantity_remaining` – valorile **curente** (cumulate de la început), nu și „cât s-a consumat în săptămâna X”.

Fără istoric pe săptămâni, nu putem calcula „usage last week” nici „forecast this week”, de aceea valorile rămân 0.

---

## Ce trebuie să conțină baza de date

### Variantă recomandată: `material_consumption` (snapshot zilnic pe material)

Un singur tabel în care **în fiecare zi** (sau la fiecare actualizare) se înregistrează **quantity_remaining** per material, raportat la **proiect** și **companie**. Astfel:

- Vezi **exact ce s-a consumat azi** la fiecare material: diferența între quantity_remaining de ieri și quantity_remaining de azi = consum în ziua respectivă.
- Poți calcula **consumul pe orice perioadă** (zi, săptămână) și de aici **forecast**: ex. usage last week = sumă consum zilnic în săptămâna trecută; forecast this week = aceeași valoare sau medie ultimele N săptămâni.

Structură propusă:

| Coloană            | Tip         | Semnificație |
|--------------------|-------------|--------------|
| id                 | SERIAL PK   | - |
| material_id        | INT NOT NULL| FK → materials.id |
| project_id         | INT NOT NULL| Proiectul (redundant dar util pentru filtre) |
| company_id         | INT NOT NULL| Compania |
| snapshot_date      | DATE NOT NULL | Ziua la care se raportează (ex. data la care s-a făcut stock check) |
| quantity_remaining | NUMERIC     | Stocul rămas la sfârșitul zilei / la momentul înregistrării |
| recorded_at        | TIMESTAMPTZ | Când a fost salvat rândul (opțional) |

**Regula de unicitate:** un rând per (material_id, snapshot_date). Dacă în aceeași zi se face de mai multe ori „Stock check”, se face **UPDATE** pe rândul pentru ziua respectivă (sau se păstrează ultima valoare), astfel că per zi ai o singură „poziție” per material.

**Consum într-o zi (per material):**  
`consum(M, D) = quantity_remaining(M, D-1) − quantity_remaining(M, D)`  
(dacă nu există D-1, poți folosi quantity_remaining din tabelul `materials` la ultima actualizare înainte de D).

**Avantaje:**

- Vezi clar **ce material s-a consumat în fiecare zi** (per material și per proiect).
- Istoricul e la nivel de zi → poți agrega la săptămână/lună și poți face forecast pe baza trendului real.
- Un singur mecanism: la fiecare actualizare stoc (Stock check / Edit qty), scrii în `material_consumption` pentru `snapshot_date = azi` și `quantity_remaining = valoarea curentă`.

---

### Variantă alternativă: tabel de consum pe săptămână

Un tabel care înregistrează direct **cât s-a consumat pe fiecare săptămână**, per proiect (și eventual per material).

| Coloană        | Tip        | Semnificație |
|----------------|------------|----------------|
| id             | SERIAL PK  | - |
| project_id     | INT        | Proiectul pentru care e raportat consumul |
| material_id    | INT        | Opțional. NULL = consum agregat pe proiect; setat = consum pentru acel material |
| week_start     | DATE       | Data de început a săptămânii (ex. luni) |
| quantity_used  | NUMERIC    | Cantitate consumată în acea săptămână |
| recorded_at    | TIMESTAMPTZ| Când a fost înregistrat (opțional) |

- **Usage last week** = SUM(quantity_used) pentru project_id și week_start = luni săptămânii trecute.
- **Forecast this week** = aceeași sumă pentru săptămâna curentă sau regulă (ex. = last week).

---

## Logica de funcționare (cu tabelul material_consumption)

1. **Definire „săptămână”**  
   Săptămâna începe luni. Săptămâna trecută = luni → duminica trecută; săptămâna curentă = luni → duminica curentă.  
   În backend: `date_trunc('week', now() AT TIME ZONE 'Europe/Bucharest')::date` și „-7 days” pentru luni săptămânii trecute.

2. **Consum într-o zi (per material)**  
   `consum(M, D) = quantity_remaining(M, D-1) − quantity_remaining(M, D)` — din `material_consumption` (material_id, snapshot_date, quantity_remaining). Dacă lipsește D-1, folosești ultima valoare cunoscută din `materials` sau ignori ziua.

   Sumă consum zilnic pentru toate zilele din săptămâna trecută și toate materialele proiectului (din `material_consumption`). Rezultatul = **Usage last week**. (Dacă unitățile diferă între materiale, poți suma doar pentru aceeași unitate sau folosi o sumă „relativă” pentru trend.)

4. **Forecast this week**  
   - Simplu: forecast = usage last week.  
   - Sau: media consumului din ultimele 2–4 săptămâni.  
   - Opțional: consum real până azi în săptămâna curentă + medie zilnică × zile rămase.

5. **Ce primește frontend-ul**  
   Backend la `GET /api/materials/forecast?projectId=...` calculează lastWeek și thisWeek din `material_consumption`, răspunde cu `{ thisWeek, lastWeek }`. Frontend afișează și compară thisWeek cu stocul total; dacă thisWeek > stoc → alertă „Consider reordering”.

---

## De unde vin datele în material_consumption

- **Din aplicație (recomandat)**: la fiecare **Stock check** sau **Edit qty** (când se actualizează `quantity_remaining` pe un material), backend-ul face **INSERT sau UPDATE** în `material_consumption`: `material_id`, `project_id`, `company_id`, `snapshot_date = azi`, `quantity_remaining = valoarea curentă`. Astfel ai exact ce stoc rămas era în fiecare zi, per material.  
- **Job zilnic (opțional)**: la sfârșitul zilei un job poate copia din `materials.quantity_remaining` în `material_consumption` pentru toate materialele proiectului, cu `snapshot_date = azi`.  
- **Import**: dacă ai istoric în alt sistem, poți popula `material_consumption` cu snapshot_date și quantity_remaining pentru zilele trecute.

---

## Rezumat

- **Tabel recomandat**: `material_consumption` – id material, project_id, company_id, **snapshot_date** (ziua), **quantity_remaining**. Un rând per (material_id, snapshot_date); la mai multe actualizări în aceeași zi se face UPDATE.  
- **Consum azi / per zi**: remaining(ieri) − remaining(azi) per material → vezi exact ce s-a consumat.  
- **Usage last week**: sumă consum zilnic (derivat din material_consumption) pentru săptămâna trecută.  
- **Forecast this week**: de ex. = last week sau medie ultimele N săptămâni.  
- După ce tabelul există și se populează la fiecare Stock check / update stoc, backend-ul poate calcula `lastWeek` și `thisWeek` și forecast-ul funcționează cu date reale.
