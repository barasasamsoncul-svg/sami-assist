import { notFound } from "next/navigation";
import AppWorkspace from "@/app/components/apps/AppWorkspace";
import { SAMI_ALL_APPS } from "@/lib/sami-all-apps.generated";

export function generateStaticParams() {
  return SAMI_ALL_APPS.map((app) => ({ app: app.route }));
}

export default async function AppPage({params}:{params:Promise<{app:string}>}) {
  const {app:route}=await params;
  const app=SAMI_ALL_APPS.find((item)=>item.route===route);
  if(!app) notFound();
  return <AppWorkspace app={app}/>;
}
