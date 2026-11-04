export type Sample = {
  id: string;
  title: string;
  blurb: string;
  text: string;
};

export const samples: Sample[] = [
  {
    id: "dinner",
    title: "Friday dinner",
    blurb: "One card, three people",
    text: "Friday dinner at Luigi's. Maya paid $86.40. Split equally between Maya, Jordan, and Sam.",
  },
  {
    id: "cabin",
    title: "Cabin weekend",
    blurb: "Elena sat out the groceries",
    text: [
      "Cabin weekend",
      "Rent $300.00 paid by Priya — split equally between Priya, Noah, and Elena.",
      "Groceries $45.75 paid by Noah — Priya and Noah only.",
      "Gas $60.00 paid by Elena — split equally between Priya, Noah, and Elena.",
    ].join("\n"),
  },
  {
    id: "receipt",
    title: "Corner Market",
    blurb: "A receipt where the wine is one person's",
    text: [
      "Corner Market receipt paid by Alex.",
      "Milk $4.50 — Alex, Blake, and Casey.",
      "Wine $18.00 — Blake only.",
      "Bread $3.25 — Alex and Casey.",
    ].join("\n"),
  },
];

export function sampleById(id: string): Sample | undefined {
  return samples.find((sample) => sample.id === id);
}
