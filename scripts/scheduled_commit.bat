@echo off
cd /d "c:\DJ Sanghvi College\Projects\smart-student-commute-companion"
echo [%date% %time%] Scheduled commit execution triggered >> scheduled_commit.log

git add . >> scheduled_commit.log 2>&1

git diff --cached --quiet
if errorlevel 1 (
    git commit -m "chore(auto-schedule): automated scheduled commit at 12:30 AM IST (04 Nov 2026)" >> scheduled_commit.log 2>&1
    git push origin main >> scheduled_commit.log 2>&1
    echo [%date% %time%] Successfully committed and pushed changes! >> scheduled_commit.log
) else (
    echo [%date% %time%] No changes to commit, checking unpushed commits... >> scheduled_commit.log
    git push origin main >> scheduled_commit.log 2>&1
    echo [%date% %time%] Push check completed. >> scheduled_commit.log
)

