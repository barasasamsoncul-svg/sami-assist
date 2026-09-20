# SaMi People & Access — Direct App Grants

This update adds explicit per-member/per-invitation business-app grants without bypassing role permissions.

## Effective access

`effective business access = role permissions ∩ app grant policy ∩ company/record scope`

- **Roles** define what actions a user may perform.
- **Apps** define which role-enabled installed apps are available to the user.
- **Companies** define where that access applies.
- **SaMi AI** is not a business-app grant; it remains a workspace subscription entitlement.

## App modes

- `role_based`: every installed app represented by the user's effective role permissions is available.
- `selected`: only explicitly selected apps remain available, and only when the user's roles grant permissions for those apps.

Existing memberships and invitations remain `role_based` for backward compatibility. New invitations default to `selected` after the migration.

## Apply order

1. Run `scripts/migrate-category-7-9-app-grants.ts`.
2. Replace/add backend service files.
3. Replace `lib/auth/permission-context.ts` and `lib/services/member-directory.ts`.
4. Add/replace API routes.
5. Replace Users/Invitations pages and `UsersSettingsClient.tsx`.
6. Run the project build.

## Commands

```powershell
npx tsx scripts/migrate-category-7-9-app-grants.ts
npm run build
```

If the earlier membership-loss session trigger repair has not been applied yet, run that migration before testing suspend/remove lifecycle actions.
