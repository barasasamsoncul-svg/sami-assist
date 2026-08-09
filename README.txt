SaMi Settings Package

Extract this ZIP into:
C:\dev\sami-assist-web

It creates:
app\api\business\settings\route.ts
app\components\settings\SettingsPanel.tsx

Then import in DashboardLayout.tsx:
import SettingsPanel from "@/app/components/settings/SettingsPanel";

Replace the current case "settings" content with:
case "settings":
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
      <SettingsPanel />
    </div>
  );

The API resolves the business from the authenticated session:
user -> business_users -> businesses

It updates the existing businesses.logo column.
