import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Copy, Check, Download, ArrowLeft, ArrowUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Image URLs are assumed to be correctly resolved by your build tool
const ollamaImg = new URL("/ollama.png", import.meta.url).href;
const spotlightImg = new URL("/spotlight.png", import.meta.url).href;
const windowsSearchImg = new URL("/windows-search.png", import.meta.url).href;
const terminalSuccessImg = new URL("/terminal-success.png", import.meta.url)
  .href;
const tutorialImg = new URL("/tutorial.png", import.meta.url).href;

// --- Reusable Themed Components ---

const TutorialSection = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px 0px" });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: isInView ? 1 : 0, y: isInView ? 0 : 50 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {children}
    </motion.section>
  );
};

const TerminalCommand = ({
  command,
  description,
  children,
}: {
  command: string;
  description: string;
  children?: React.ReactNode;
}) => {
  const [hasCopied, setHasCopied] = useState(false);
  const copyToClipboard = () => {
    navigator.clipboard.writeText(command);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };
  return (
    <div className="bg-base-dark rounded-xl border border-border-dark relative">
      <div className="p-6">
        <div className="flex items-center pb-4 border-b border-border-dark mb-4">
          <div className="w-3 h-3 rounded-full bg-danger mr-2"></div>
          <div className="w-3 h-3 rounded-full bg-warning mr-2"></div>
          <div className="w-3 h-3 rounded-full bg-success"></div>
        </div>
        <button
          onClick={copyToClipboard}
          className="absolute top-3 right-3 p-2 bg-tertiary-dark text-text-dark-sub rounded-lg hover:bg-secondary-dark transition-colors"
          aria-label="Copy command"
        >
          {hasCopied ? (
            <Check size={16} className="text-success" />
          ) : (
            <Copy size={16} />
          )}
        </button>
        <pre>
          <code className="text-success text-sm">$ {command}</code>
        </pre>
        <p className="text-text-dark-sub mt-4 text-sm">// {description}</p>
      </div>
      {children && (
        <div className="border-t border-border-dark bg-black/20 p-6 rounded-b-xl">
          {children}
        </div>
      )}
    </div>
  );
};

const DownloadCard = ({
  os,
  description,
  url,
}: {
  os: string;
  description: string;
  url: string;
}) => (
  <div className="bg-secondary-light dark:bg-secondary-dark p-6 rounded-xl border border-border-light dark:border-border-dark text-center flex flex-col items-center">
    <h3 className="font-display text-xl font-semibold text-text-light dark:text-text-dark mb-2">
      {os}
    </h3>
    <p className="text-text-light-sub dark:text-text-dark-sub mb-4 text-sm flex-grow">
      {description}
    </p>
    <a
      href={url}
      onClick={(e) => {
        e.preventDefault();
        (window as any).electron.openExternal(url);
      }}
      className="inline-flex items-center gap-2 bg-light1 dark:bg-dark1 text-white font-semibold px-6 py-2 rounded-lg hover:bg-light1 dark:bg-dark1/90 transition-colors"
    >
      <Download size={16} /> Download
    </a>
  </div>
);

const TerminalGuide = () => {
  const [activeTab, setActiveTab] = useState("windows");
  return (
    <div className="bg-secondary-light dark:bg-secondary-dark rounded-xl border border-border-light dark:border-border-dark p-6">
      <h3 className="font-display text-xl font-bold mb-4 text-center text-text-light dark:text-text-dark">
        How to Open the Command Line
      </h3>
      <div className="flex justify-center mb-6 bg-tertiary-light dark:bg-tertiary-dark p-1 rounded-full">
        {["macos", "windows"].map((tab) => (
          <button
            // disabled={tab === "macos"}
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="relative px-4 py-1.5 rounded-full text-sm font-semibold transition-colors flex-1"
          >
            {activeTab === tab && (
              <motion.div
                layoutId="terminal-guide-pill"
                className="absolute inset-0 bg-surface-light dark:bg-surface-dark rounded-full shadow-md"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <span
              className={`relative capitalize ${
                activeTab === tab
                  ? "text-dark1 dark:text-light1"
                  : "text-text-light-sub dark:text-text-dark-sub"
              }`}
            >
              {tab}
            </span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          {activeTab === "macos" ? (
            <div className="grid md:grid-cols-2 gap-6 items-center">
              <div>
                <p className="text-text-light-sub dark:text-text-dark-sub mb-4">
                  The app is called{" "}
                  <strong className="text-text-light dark:text-text-dark">
                    Terminal
                  </strong>
                  .
                </p>
                <ol className="list-decimal pl-5 space-y-2 text-text-light-sub dark:text-text-dark-sub">
                  <li>
                    Press <kbd className="kbd">⌘ Cmd</kbd> +{" "}
                    <kbd className="kbd">Space</kbd> to open Spotlight Search.
                  </li>
                  <li>Type "Terminal" and press Enter.</li>
                </ol>
              </div>
              <img
                src={spotlightImg}
                alt="macOS Spotlight Search for Terminal"
                className="rounded-lg border border-border-light dark:border-border-dark"
              />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6 items-center">
              <div>
                <p className="text-text-light-sub dark:text-text-dark-sub mb-4">
                  The app is called{" "}
                  <strong className="text-text-light dark:text-text-dark">
                    Command Prompt
                  </strong>
                  .
                </p>
                <ol className="list-decimal pl-5 space-y-2 text-text-light-sub dark:text-text-dark-sub">
                  <li>
                    Press the <kbd className="kbd">⊞ Win</kbd> key to open the
                    Start Menu.
                  </li>
                  <li>Type "cmd" or "Command Prompt" and click on the app.</li>
                </ol>
              </div>
              <img
                src={windowsSearchImg}
                alt="Windows Search for Command Prompt"
                className="rounded-lg border border-border-light dark:border-border-dark"
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// --- Main Tutorial Page Component ---
const OllamaTutorialPage = () => {
  const navigate = useNavigate();
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const mainScrollableElement = document.querySelector("main"); // Or your specific scrollable element
    const handleScroll = () => {
      if (mainScrollableElement && mainScrollableElement.scrollTop > 300) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };

    mainScrollableElement?.addEventListener("scroll", handleScroll);
    return () =>
      mainScrollableElement?.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    const mainScrollableElement = document.querySelector("main");
    mainScrollableElement?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="bg-base-light dark:bg-base-dark text-text-light dark:text-text-dark font-sans">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-text-light-sub dark:text-text-dark-sub hover:text-dark1 dark:text-light1 dark:hover:text-dark1 dark:text-light1 font-semibold transition-colors"
          >
            <ArrowLeft size={18} />
            Go Back
          </button>
        </div>
        <header className="text-center mb-20">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-5xl font-display font-extrabold tracking-tight text-text-light dark:text-text-dark mb-4"
          >
            Run AI Locally with Ollama
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-xl text-text-light-sub dark:text-text-dark-sub max-w-3xl mx-auto"
          >
            A complete guide to setting up and using open-source AI models on
            your own machine.
          </motion.p>
        </header>

        <main className="space-y-24">
          <TutorialSection>
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="font-display text-3xl font-bold text-text-light dark:text-text-dark mb-4">
                  What is Ollama?
                </h2>
                <div className="prose prose-lg dark:prose-invert text-text-light-sub dark:text-text-dark-sub max-w-none space-y-4">
                  <p>
                    Ollama is a powerful tool that allows you to download, run,
                    and manage large language models (like Llama 3, Mistral, and
                    more) directly on your own computer. This means you can
                    leverage state-of-the-art AI for tasks like analysis and
                    chat, all while keeping your data completely private and
                    offline.
                  </p>
                  <p>
                    By running models locally, you gain privacy, control, and
                    the ability to work without an internet connection.
                  </p>
                </div>
              </div>
              <motion.div
                className="rounded-xl overflow-hidden shadow-2xl"
                whileHover={{ scale: 1.03 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <img
                  src={ollamaImg}
                  alt="Ollama Logo"
                  className="w-full h-full bg-secondary-light dark:bg-secondary-dark p-10 px-20 object-contain"
                />
              </motion.div>
            </div>
          </TutorialSection>
          <TutorialSection>
            <h2 className="text-3xl font-display font-bold text-text-light dark:text-text-dark text-center mb-6">
              Step 1: Install Ollama
            </h2>
            <p className="text-lg text-text-light-sub dark:text-text-dark-sub text-center max-w-2xl mx-auto mb-12">
              Download the installer for your operating system. It’s a
              straightforward process that sets up everything you need.
            </p>
            <div className="grid md:grid-cols-3 gap-8">
              <DownloadCard
                os="macOS"
                description="Double-click the downloaded .zip file, then drag the Ollama icon to your Applications folder."
                url="https://ollama.com/download/Ollama.dmg"
              />
              <DownloadCard
                os="Windows"
                description="Double-click the 'OllamaSetup.exe' file and follow the installation wizard instructions."
                url="https://ollama.com/download/OllamaSetup.exe"
              />
              <DownloadCard
                os="Linux"
                description="For Linux, copy the one-line command from the official site and run it in your terminal."
                url="https://ollama.com/download/linux"
              />
            </div>
          </TutorialSection>
          <TutorialSection>
            <h2 className="font-display text-3xl font-bold text-text-light dark:text-text-dark text-center mb-6">
              Step 2: Verify the Installation
            </h2>
            <p className="text-lg text-text-light-sub dark:text-text-dark-sub text-center max-w-2xl mx-auto mb-12">
              Before downloading a model, let's make sure Ollama is installed
              correctly. This requires using the command line.
            </p>
            <TerminalGuide />
            <p className="text-lg text-text-light-sub dark:text-text-dark-sub text-center max-w-2xl mx-auto my-12">
              Now, type the following command into the window you just opened
              and press Enter.
            </p>
            <TerminalCommand
              command="ollama --version"
              description="Checks if Ollama is installed and ready."
            >
              <p className="text-text-dark-sub text-sm mb-2">
                Expected Output:
              </p>
              <pre>
                <code className="text-sm text-text-dark">
                  ollama version is 0.1.32
                </code>
              </pre>
              <p className="text-text-dark-sub text-xs mt-2">
                (Your version number might be different.)
              </p>
            </TerminalCommand>
          </TutorialSection>
          <TutorialSection>
            <h2 className="font-display text-3xl font-bold text-text-light dark:text-text-dark text-center mb-6">
              Step 3: Download an AI Model
            </h2>
            <p className="text-lg text-text-light-sub dark:text-text-dark-sub text-center max-w-2xl mx-auto mb-12">
              Great! Now use a command to download your first model. This can
              take several minutes. We recommend starting with the
              llama3.2:latest as it is the most stable version.
            </p>
            <TerminalCommand
              command="ollama run llama3.2:latest"
              description="This downloads and prepares the Llama 3 model."
            >
              <p className="text-text-dark-sub text-sm mb-2">
                When it's done, you'll see this prompt:
              </p>
              <img
                src={terminalSuccessImg}
                alt="Terminal showing a successful model load"
                className="rounded-md mt-2 border border-border-dark"
              />
              <p className="text-text-dark-sub text-sm mt-4">
                You can now chat with the model in your terminal! When you're
                done, type `/bye`.
              </p>
            </TerminalCommand>
            <p className="text-center text-text-light-sub dark:text-text-dark-sub mt-8 max-w-2xl mx-auto">
              You can find many other models to try on the{" "}
              <a
                href="https://ollama.com/library"
                onClick={(e) => {
                  e.preventDefault();
                  (window as any).electron?.shell.openExternal(
                    "https://ollama.com/library"
                  );
                }}
                className="text-dark1 dark:text-light1 hover:text-dark1 dark:text-light1/90 font-semibold"
              >
                Ollama Library
              </a>
              .
            </p>
          </TutorialSection>
          <TutorialSection>
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <motion.div
                className="rounded-xl overflow-hidden shadow-2xl"
                whileHover={{ scale: 1.03 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <img
                  src={tutorialImg}
                  alt="MindSage settings showing AI model selection"
                  className="w-full h-full object-cover"
                />
              </motion.div>
              <div>
                <h2 className="font-display text-3xl font-bold text-text-light dark:text-text-dark mb-4">
                  Step 4: Connect to MindSage
                </h2>
                <div className="prose prose-lg dark:prose-invert text-text-light-sub dark:text-text-dark-sub max-w-none space-y-4">
                  <p>
                    The final step is to tell MindSage to use your new local
                    model. After running a model with Ollama, it will appear in
                    your profile settings.
                  </p>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>Click on your profile icon in the top-right corner.</li>
                    <li>In the dropdown, find the "AI Model" section.</li>
                    <li>Select your newly downloaded model from the list.</li>
                  </ol>
                  <p>
                    That's it! MindSage will now use your local model, ensuring
                    your data remains completely private.
                  </p>
                </div>
              </div>
            </div>
          </TutorialSection>
        </main>
      </div>

      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 bg-surface-light dark:bg-surface-dark p-3 rounded-full shadow-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:text-dark1 dark:text-light1 dark:hover:text-dark1 dark:text-light1 transition-colors"
            aria-label="Back to top"
          >
            <ArrowUp size={20} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OllamaTutorialPage;
