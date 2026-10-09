import { RouteAccent } from "@/components/shell/app-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RouteAccent route="login" />
      {children}
    </>
  );
}
