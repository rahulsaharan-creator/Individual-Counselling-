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
- Students due this round go first (rounds are counted per class group), then students who have not met the teacher, then the higher rule, then the student counselled longest ago. Seats stay empty only when no free student of that class group is left. The **Why · log** tab shows the reason for every empty seat.

Student file: only the student template is accepted (**Set up → Download student template**).
- **Students** sheet, one row per student: Roll No, Student Name, Batch (as in the timetable), Class (11th, 12th or Target), Status (Active or Left), Course.
- **Counselling History** sheet, one row per counselling already held: Roll No, Date, Counsellor Code (timetable short code), Result (Done or Absent).
- Every upload is checked row by row. Rows with errors are not used and are listed with their row numbers; warnings are listed but do not stop the upload.

Settings, the last schedule, attendance and the counselling records are saved only on this computer, in this browser. Nothing is sent to a server. Do reception and planning in the same browser on the same computer, and export the records from the Dashboard every week to keep a copy. Use **Rules and lists → Export settings** to copy them to another computer.

## Changing the code
`source/` holds the editable files. After editing `src.html` or `engine.js`, run `node source/build.js` from inside `source/` and copy `source/dist/index.html` over `index.html`.

## Usage analytics
The site records usage (opens, who, which buttons and settings, calculations, downloads, errors, time spent) in the Google Sheet "Counselling Planner usage analytics". It sends no file contents, student names, roll numbers or cell values.
- `source/analytics.js` collects the events. `source/analytics-apps-script.gs` is the receiver, pasted into the sheet's Apps Script and deployed as a web app.
- The web app URL goes in `source/analytics-url.txt`. Leave the file empty to switch analytics off. Rebuild after changing it.

