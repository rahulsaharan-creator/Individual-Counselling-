# Counselling Planner

A one-page website that builds the weekly counselling schedule from the faculty timetable and the student data.
Everything runs in the browser. Uploaded files are never sent to a server; they are kept in that browser only.

## Put it on Vercel (pick one way)

**A. Through GitHub (recommended, easy to update later)**
1. Create a new GitHub repository and upload everything in this folder (`index.html`, `vercel.json`, `README.md`, `source/`).
2. In Vercel: **Add New → Project → Import** that repository.
3. Framework preset: **Other**. Leave build command and output directory empty. Click **Deploy**.
4. To update the site later, replace `index.html` in GitHub; Vercel redeploys automatically.

**B. Command line**
```
npm i -g vercel
cd counselling-planner
vercel --prod
```

## Weekly use
1. **Set up** (one page) – upload this week’s timetable (and the student file when it changes), check the Monday date, cabins and periods, and adjust matching rules, buildings or teachers if anything changed. Use the index on the left to jump between sections.
2. **Calculate schedule** – the result opens on the **Weekly schedule** page: cabin board, teacher sessions, students, workload and moves. Edit slots, replace students, then **Download Excel**.

3. **During the week** – reception uses the **Reception** tab to enter each teacher's in and out time, and to mark each student present or absent and whether a parent came. The **Announcements** tab (and sheet) lists students by building, floor, room and batch, for announcements in class.
4. **End of the week** – **Download report** gives the teacher in-out, student attendance, absent remarks and a weekly summary. On the **Dashboard**, **Save this week to records** adds the counselled students to the records database, so next week books the students still waiting.

How students are matched:
- Each cabin has a building. When a cabin is in PC, teachers with a class at PC campus just before or after counselling get a PC cabin, with students whose class is at PC.
- Students only meet a teacher of their class: 11th with 11th and FTP (new) teachers, 12th with 12th, Target with Target. A teacher with no class set and no classes in the timetable is treated as FTP.
- Senior faculty (12th and Target teachers) are never moved when cabins are full.
- Every student is counselled once before anyone is booked again. A switch can fill the seats this leaves empty.

Settings, the last schedule, attendance and the counselling records are saved in the browser. Export the records from the Dashboard to keep a copy in Drive. Use **Rules and lists → Export settings** to copy them to another computer.

## Shared database (Supabase)
Without a database, everything stays in the browser that entered it. With one, the planner and reception share the week, the attendance and the counselling records from any computer.
1. In Vercel, open the project → **Storage** → **Create** → **Supabase**, and connect it to this project. This adds `POSTGRES_URL` and the other database settings.
2. In **Settings → Environment Variables**, add `PLANNER_PIN` and `RECEPTION_PIN` (at least 6 characters each, different from each other).
3. Redeploy. The site then asks for a PIN. The planner PIN opens everything; the reception PIN opens only the Reception page, where reception enters teacher and student in-out times, attendance and whether a parent came.

`api/db.js` is the only code that talks to the database, and it creates its tables on first use. The tables have row level security switched on with no policies, so Supabase's public API cannot read them. Student names, roll numbers, batches and attendance are stored there.

## Changing the code
`source/` holds the editable files. After editing `src.html` or `engine.js`, run `node source/build.js` from inside `source/` and copy `source/dist/index.html` over `index.html`.

## Usage analytics
The site records usage (opens, who, which buttons and settings, calculations, downloads, errors, time spent) in the Google Sheet "Counselling Planner usage analytics". It sends no file contents, student names, roll numbers or cell values.
- `source/analytics.js` collects the events. `source/analytics-apps-script.gs` is the receiver, pasted into the sheet's Apps Script and deployed as a web app.
- The web app URL goes in `source/analytics-url.txt`. Leave the file empty to switch analytics off. Rebuild after changing it.

