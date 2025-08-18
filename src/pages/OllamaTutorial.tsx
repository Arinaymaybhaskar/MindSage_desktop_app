import React, { useState, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Copy, Check, Download } from "lucide-react";

// --- Reusable Components ---

// Wrapper for sections to handle the fade-in animation on scroll
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

// Terminal command block with a functional copy button
const TerminalCommand = ({
  command,
  description,
}: {
  command: string;
  description: string;
}) => {
  const [hasCopied, setHasCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(command);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  return (
    <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 relative">
      <div className="flex items-center pb-4 border-b border-slate-800 mb-4">
        <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
      </div>
      <button
        onClick={copyToClipboard}
        className="absolute top-5 right-5 p-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors"
        aria-label="Copy command"
      >
        {hasCopied ? (
          <Check size={16} className="text-green-400" />
        ) : (
          <Copy size={16} />
        )}
      </button>
      <pre>
        <code className="text-green-400 text-sm">$ {command}</code>
      </pre>
      <p className="text-slate-400 mt-4 text-sm">// {description}</p>
    </div>
  );
};

// Card for OS-specific download links
const DownloadCard = ({
  os,
  description,
  url,
}: {
  os: string;
  description: string;
  url: string;
}) => (
  <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 text-center flex flex-col items-center">
    <h3 className="text-xl font-semibold text-white mb-2">{os}</h3>
    <p className="text-slate-400 mb-4 text-sm flex-grow">{description}</p>
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
    >
      <Download size={16} />
      Download
    </a>
  </div>
);

// --- Main Tutorial Page Component ---
const OllamaTutorialPage = () => {
  return (
    <div className="bg-slate-900 text-slate-300 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:py-20">
        <header className="text-center mb-20">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-5xl font-extrabold tracking-tight text-white mb-4"
          >
            Run AI Locally with Ollama
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-xl text-slate-400 max-w-3xl mx-auto"
          >
            A complete guide to setting up and using powerful open-source AI
            models on your own machine for use in MindSage.
          </motion.p>
        </header>

        <main className="space-y-24">
          <TutorialSection>
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold text-white mb-4">
                  What is Ollama?
                </h2>
                <div className="prose prose-lg text-slate-300 space-y-4">
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
                  src="https://images.unsplash.com/photo-1677756119517-756a188d2d94?q=80&w=2070&auto=format&fit=crop"
                  alt="Abstract AI visualization"
                  className="w-full h-full object-cover"
                />
              </motion.div>
            </div>
          </TutorialSection>

          <TutorialSection>
            <h2 className="text-3xl font-bold text-white text-center mb-6">
              Step 1: Install Ollama
            </h2>
            <p className="text-lg text-slate-400 text-center max-w-2xl mx-auto mb-12">
              Download and install Ollama for your operating system. It's a
              straightforward process that sets up everything you need.
            </p>
            <div className="grid md:grid-cols-3 gap-8">
              <DownloadCard
                os="macOS"
                description="Download the application and move it to your Applications folder."
                url="https://ollama.com/download/Ollama-darwin.zip"
              />
              <DownloadCard
                os="Windows"
                description="Download and run the installer executable."
                url="https://ollama.com/download/OllamaSetup.exe"
              />
              <DownloadCard
                os="Linux"
                description="Run the installation script in your terminal."
                url="https://ollama.com/download/ollama-linux-amd64"
              />
            </div>
            <p className="text-center text-slate-400 mt-8">
              For detailed instructions, visit the official{" "}
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                Ollama Download Page
              </a>
              .
            </p>
          </TutorialSection>

          <TutorialSection>
            <h2 className="text-3xl font-bold text-white text-center mb-6">
              Step 2: Download an AI Model
            </h2>
            <p className="text-lg text-slate-400 text-center max-w-2xl mx-auto mb-12">
              Once Ollama is installed, open your terminal (Terminal on Mac,
              PowerShell on Windows) and run a command to download your first
              model. We recommend starting with a smaller, efficient model.
            </p>
            <TerminalCommand
              command="ollama run llama3:8b"
              description="This will download and run the Llama 3 8B model. The first download may take several minutes."
            />
            <p className="text-slate-400 mt-8 max-w-2xl mx-auto">
              You can find many other models to try on the{" "}
              <a
                href="https://ollama.com/library"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                Ollama Library
              </a>
              . Simply replace `llama3:8b` with the name of any other model,
              like `mistral` or `phi3`.
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
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop"
                  alt="Dashboard with settings"
                  className="w-full h-full object-cover"
                />
              </motion.div>
              <div>
                <h2 className="text-3xl font-bold text-white mb-4">
                  Step 3: Connect to MindSage
                </h2>
                <div className="prose prose-lg text-slate-300 space-y-4">
                  <p>
                    The final step is to tell MindSage to use your new local
                    model. After running a model with Ollama, it will appear in
                    your profile settings.
                  </p>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>
                      Click on your profile icon in the top-right corner of the
                      app.
                    </li>
                    <li>In the dropdown menu, find the "AI Model" section.</li>
                    <li>
                      Select your newly downloaded model (e.g., `llama3:8b`)
                      from the list.
                    </li>
                  </ol>
                  <p>
                    That's it! MindSage will now use your local Ollama model for
                    all AI-powered features, ensuring your data remains
                    completely private.
                  </p>
                </div>
              </div>
            </div>
          </TutorialSection>
        </main>
      </div>
    </div>
  );
};

export default OllamaTutorialPage;
