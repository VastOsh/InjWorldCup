import { redirect } from "next/navigation";

// The standalone sign-in page is retired: wallet sign-in now lives inline on
// /market (Polymarket-style). Anything still pointing here lands on the board.
export default function LoginPage() {
  redirect("/market");
}
