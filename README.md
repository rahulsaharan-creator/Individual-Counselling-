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

Settings and the last schedule are saved in the browser. Use **Rules and lists → Export settings** to copy them to another computer.

## Changing the code
`source/` holds the editable files. After editing `src.html` or `engine.js`, run `node source/build.js` from inside `source/` and copy `source/dist/index.html` over `index.html`.

## Usage analytics
The site records usage (opens, who, which buttons and settings, calculations, downloads, errors, time spent) in the Google Sheet "Counselling Planner usage analytics". It sends no file contents, student names, roll numbers or cell values.
- `source/analytics.js` collects the events. `source/analytics-apps-script.gs` is the receiver, pasted into the sheet's Apps Script and deployed as a web app.
- The web app URL goes in `source/analytics-url.txt`. Leave the file empty to switch analytics off. Rebuild after changing it.

