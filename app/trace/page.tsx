import { DraftingRecord } from "@/components/trace/DraftingRecord";

export const metadata = {
  title: "Drafting Record · Drafter",
  description:
    "What the self-correction loop did to produce this draft, including every figure the output validator refused.",
};

export default function TracePage() {
  return <DraftingRecord />;
}
