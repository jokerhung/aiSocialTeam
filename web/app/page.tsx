import { redirect } from "next/navigation";

// There is no sign-in or landing page: the app opens on the dashboard, which asks for a first campaign when there is none
export default function Home() {
  redirect("/dashboard");
}
