SaMi Settings v2

Replace:
app\components\settings\SettingsPanel.tsx

The existing /api/apps/selection route is used to add apps. It sends the complete enabled app list, preserving existing apps.

DashboardLayout connection:
1. Add:
import SettingsPanel from "@/app/components/settings/SettingsPanel";

2. Replace the current case "settings" with:
case "settings":
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
      <SettingsPanel />
    </div>
  );

Important: this UI exposes dynamic app-specific controls, but those controls are intentionally not falsely persisted until the corresponding tenant schemas contain the required settings tables/columns. App addition itself uses the existing selection API.
