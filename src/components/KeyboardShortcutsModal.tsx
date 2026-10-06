import { createPortal } from "react-dom";
import Modal from "./Modal";
import shortcuts from "../utils/keyboardShortcuts";

const key = (k: string) => (
  <span className="inline-block px-2 py-1 mr-1 mb-1 border border-border-light dark:border-border-dark rounded bg-secondary-light dark:bg-secondary-dark text-xs font-mono text-text-light-sub dark:text-text-dark-sub">
    {k}
  </span>
);

const renderCombo = (combo: string) => {
  return combo.split("+").map((part, i, arr) => (
    <span key={i}>
      {key(part)}
      {i < arr.length - 1 ? "+" : ""}
    </span>
  ));
};

const KeyboardShortcutsModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Keyboard Shortcuts"
      size="2xl"
    >
      <div className="space-y-6 max-h-[84%] overflow-y-auto">
        {Object.entries(shortcuts).map(([category, items]) => (
          <div key={category} className="relative">
            <h3 className="sticky top-0 bg-secondary-light dark:bg-secondary-dark text-lg font-medium text-text-light dark:text-text-dark mb-2 px-2 py-1 z-10  border-border-light dark:border-border-dark">
              {category.charAt(0).toUpperCase() + category.slice(1)} Shortcuts
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-border-light dark:border-border-dark text-left">
                <thead
                  className="bg-secondary-light dark:bg-secondary-dark sticky"
                  style={{ top: "0 rem", zIndex: 5 }}
                >
                  <tr>
                    <th className="px-4 py-2 border-b border-border-light dark:border-border-dark w-1/3">
                      Action
                    </th>
                    <th className="px-4 py-2 border-b border-border-light dark:border-border-dark w-1/3">
                      Windows/Linux
                    </th>
                    {/* <th className="px-4 py-2 border-b border-border-light dark:border-border-dark w-1/4">
                      Mac
                    </th> */}
                    <th className="px-4 py-2 border-b border-border-light dark:border-border-dark w-1/3">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(items).map(([action, data]) => (
                    <tr
                      key={action}
                      className="hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
                    >
                      <td className="px-4 py-2 border-b border-border-light dark:border-border-dark">
                        {action
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (str) => str.toUpperCase())}
                      </td>
                      {Array.isArray(data.keys) ? (
                        <>
                          <td className="px-4 py-2 border-b border-border-light dark:border-border-dark">
                            {renderCombo(data.keys[0])}
                          </td>
                          {/* <td className="px-4 py-2 border-b border-border-light dark:border-border-dark">
                            {renderCombo(data.keys[1])}
                          </td> */}
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 border-b border-border-light dark:border-border-dark">
                            {renderCombo(data.keys)}
                          </td>
                          <td className="px-4 py-2 border-b border-border-light dark:border-border-dark">
                            {renderCombo(data.keys)}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2 border-b border-border-light dark:border-border-dark">
                        {data.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
          Note: Some shortcuts may vary based on your operating system and
          browser.
        </p>
      </div>
    </Modal>,
    document.body,
  );
};

export default KeyboardShortcutsModal;
