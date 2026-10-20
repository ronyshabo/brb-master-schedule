#!/bin/sh
# Copy the shared schedule module into brb-baristas-admin, which renders the
# admin tab on staff.brbcoffee-atx.com. brb-master-schedule/src/schedule/ is
# the source of truth: edit here, run this, then commit in both repos.
#
#   ./scripts/sync-admin-tab.sh [path-to-brb-baristas-admin]   (default: ../brb-baristas-admin)
set -eu

here="$(cd "$(dirname "$0")/.." && pwd)"
target="${1:-$here/../brb-baristas-admin}/src/schedule"

mkdir -p "$target"
for file in AdminScheduleTab.jsx DroppedShiftsPanel.jsx DefaultHoursPanel.jsx AvailabilityCalendar.jsx WeeklyAvailability.jsx MonthNav.jsx ScheduleCalendar.jsx ShiftPicker.jsx \
            useScheduleData.js store.js backend.js shifts.js broadcast.js schedule.css; do
  cp "$here/src/schedule/$file" "$target/$file"
done
cat > "$target/README.md" <<'NOTE'
# schedule/ — copied from brb-master-schedule

Don't edit these files here. They're copied from `brb-master-schedule/src/schedule/`
by `brb-master-schedule/scripts/sync-admin-tab.sh`; edit there and re-run it.
NOTE
echo "Synced schedule module → $target"
