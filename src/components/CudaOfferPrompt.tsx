import { useEffect, useState } from "react";
import {
  aiModelService,
  type CudaOffer,
  type ModelResult,
} from "../api/aiModelService";

const formatMB = (bytes: number) => `${Math.round(bytes / 2 ** 20)} MB`;

/**
 * Offered once on a PC with an Nvidia GPU the CUDA engine can use (KAN-434):
 * the installer ships the CPU and Vulkan engines only. Declining is final;
 * declining or a failed download leaves local AI on the engine it has. The
 * download goes through the shared downloader (resumable, SHA-256 checked) and
 * its progress shows on the status card. Look is a separate ticket.
 */
export default function CudaOfferPrompt() {
  const [offer, setOffer] = useState<CudaOffer>({ offer: false });
  const [phase, setPhase] = useState<"offer" | "downloading" | "done">("offer");
  const [result, setResult] = useState<ModelResult | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    aiModelService
      .cudaOffer()
      .then(setOffer)
      .catch(() => undefined);
  }, []);

  if (!offer.offer || closed) return null;

  const download = async () => {
    setPhase("downloading");
    await aiModelService.answerCudaOffer(true);
    setResult(await aiModelService.download(offer.id, true));
    setPhase("done");
  };

  const decline = async () => {
    await aiModelService.answerCudaOffer(false);
    setClosed(true);
  };

  return (
    <section
      aria-labelledby="cuda-offer-title"
      className="mt-2 flex flex-col gap-1 rounded-lg border border-border-light bg-surface-light p-3 text-sm text-text-light dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
    >
      <h2 id="cuda-offer-title" className="font-semibold">
        Use your Nvidia graphics card for local AI?
      </h2>
      {phase === "offer" && (
        <>
          <p>
            MindSage can download its CUDA engine ({formatMB(offer.bytes)}),
            which runs local AI faster on Nvidia graphics cards. Without it,
            local AI keeps running as it does now.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void download()}>
              Download
            </button>
            <button type="button" onClick={() => void decline()}>
              No thanks
            </button>
          </div>
        </>
      )}
      {phase === "downloading" && (
        <p role="status">
          Downloading the CUDA engine. Local AI keeps working meanwhile.
        </p>
      )}
      {phase === "done" && result && (
        <>
          <p role={result.success ? "status" : "alert"}>
            {result.success
              ? result.restartRequired
                ? "CUDA engine installed. MindSage uses it the next time it starts."
                : "CUDA engine installed. Local AI uses it when it next starts."
              : result.notEnoughSpace
                ? result.error
                : "The download did not finish, so local AI keeps running as before."}
          </p>
          <div className="flex gap-2">
            {!result.success && (
              <button type="button" onClick={() => void download()}>
                Try again
              </button>
            )}
            <button type="button" onClick={() => setClosed(true)}>
              Close
            </button>
          </div>
        </>
      )}
    </section>
  );
}
