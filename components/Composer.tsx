"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { samples } from "@/lib/samples";

const MAX_IMAGE_BYTES = 1_500_000;

export function Composer() {
  const router = useRouter();
  const [text, setText] = useState(samples[1]?.text ?? "");
  const [image, setImage] = useState<{ mediaType: string; base64: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerMock, setOfferMock] = useState(false);

  async function propose(forceMock: boolean) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          forceMock,
          image: image ? { mediaType: image.mediaType, base64: image.base64 } : null,
        }),
      });
      const json = (await response.json()) as {
        group?: { id: string };
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !json.group) {
        setError(json.error?.message ?? "Could not propose a split.");
        setOfferMock(json.error?.code === "GATEWAY" || json.error?.code === "NO_TOOL_CALL" || json.error?.code === "AI_NOT_CONFIGURED");
        return;
      }
      router.push(`/settlements/${json.group.id}`);
      router.refresh();
    } catch {
      setError("The request did not finish. Nothing was saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="sheet"
      onSubmit={(event) => {
        event.preventDefault();
        void propose(false);
      }}
    >
      <h2>What did the group spend?</h2>
      <p className="lede">
        Paste a chat recap, a trip note, or a receipt written out as text. The agent extracts the expenses and shows its reasoning. Nobody is charged until a person approves.
      </p>
      <div className="samples" role="group" aria-label="Sample notes">
        {samples.map((sample) => (
          <button
            key={sample.id}
            type="button"
            className="chip"
            data-testid={`sample-${sample.id}`}
            onClick={() => {
              setText(sample.text);
              setError(null);
            }}
          >
            {sample.title}
          </button>
        ))}
      </div>
      <label htmlFor="note">Note</label>
      <textarea
        id="note"
        data-testid="note"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Maya paid $86.40. Split equally between Maya, Jordan, and Sam."
      />
      <div className="row">
        <label className="file" htmlFor="receipt">
          Receipt photo (used only when the AI Gateway is configured)
          <input
            id="receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                setImage(null);
                return;
              }
              if (file.size > MAX_IMAGE_BYTES) {
                setError("That photo is over 1.5 MB. Paste the receipt text instead.");
                event.target.value = "";
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const result = String(reader.result ?? "");
                const base64 = result.split(",")[1] ?? "";
                setImage({ mediaType: file.type, base64, name: file.name });
              };
              reader.readAsDataURL(file);
            }}
          />
        </label>
        {image ? <span className="meta">{image.name}</span> : null}
      </div>
      <div className="row">
        <button className="button" type="submit" data-testid="propose" disabled={pending}>
          {pending ? "Reading the note…" : "Propose split"}
        </button>
        {offerMock ? (
          <button
            className="button secondary"
            type="button"
            disabled={pending}
            onClick={() => void propose(true)}
          >
            Use the mock parser instead
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="alert" role="alert" data-testid="propose-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
