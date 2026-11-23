import type { Metadata } from "next";
import PitchDeck from "@/components/PitchDeck";
import "./pitch.css";

export const metadata: Metadata = {
  title: "Cognita · Pitch deck",
  description: "Cognita pitch deck: see everything your Claude Code agent has access to.",
};

export default function PitchPage() {
  return <PitchDeck />;
}
