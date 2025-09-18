// keyboardShortcuts.ts
const shortcuts = {
  global: {
    globalSearch: {
      keys: ["Ctrl+F", "⌘+F"],
      description: "Open the global search popup",
    },
    openSettings: {
      keys: ["Ctrl+,", "⌘+,"],
      description: "Open the application settings",
    },
    // toggleTheme: {
    //   keys: ["Ctrl+Shift+L", "⌘+Shift+L"],
    //   description: "Toggle light/dark theme",
    // },
    // closeTab: {
    //   keys: ["Ctrl+W", "⌘+W"],
    //   description: "Close the current tab",
    // },
    goBack: {
      keys: ["Backspace", "Backspace"],
      description: "Navigate back to the previous page",
    },
    // lockApp: {
    //   keys: ["Ctrl+Q", "⌘+Q"],
    //   description: "Lock the application",
    // },
    showShortcuts: {
      keys: ["Ctrl+.", "⌘+."],
      description: "Show keyboard shortcuts modal",
    },
    newEntry: {
      keys: ["Ctrl+N", "⌘+N"],
      description: "Create a new journal entry",
    },
  },
  journal: {
    saveEntry: {
      keys: ["Ctrl+S", "⌘+S"],
      description: "Save the current entry draft",
    },
    completeEntry: {
      keys: ["Ctrl+ ⏎ Enter", "⌘+ ⏎ Enter"],
      description: "Create or update the entry and close the form",
    },
    editEntry: {
      keys: ["Ctrl + E", "⌘ + E"],
      description: "Edit the selected entry",
    },
    deleteEntry: {
      keys: ["Delete", "Delete"],
      description: "Delete the selected entry",
    },
    // duplicateEntry: {
    //   keys: ["Ctrl+D", "⌘+D"],
    //   description: "Duplicate the current entry",
    // },
    // pastePlainText: {
    //   keys: ["Ctrl+Shift+V", "⌘+Shift+V"],
    //   description: "Paste text without formatting",
    // },
    navigateEntries: {
      keys: ["↑ / ↓", "↑ / ↓"],
      description: "Navigate between entries",
    },
    openEntry: {
      keys: ["⏎ Enter", "⏎ Enter"],
      description: "Open the selected entry",
    },
    // nextEntry: {
    //   keys: ["Alt+Right", "Option+Right"],
    //   description: "Go to the next entry",
    // },
    // previousEntry: {
    //   keys: ["Alt+Left", "Option+Left"],
    //   description: "Go to the previous entry",
    // },
  },
  // chat: {
  //   sendMessage: {
  //     keys: ["Ctrl+⏎ Enter", "⌘+Enter"],
  //     description: "Send the chat message",
  //   },
  //   editLastMessage: {
  //     keys: ["↑ (when input is empty)", "↑ (when input is empty)"],
  //     description: "Edit the last sent message",
  //   },
  //   autocomplete: {
  //     keys: ["Tab", "Tab"],
  //     description: "Trigger autocomplete in chat input",
  //   },
  //   reverseAutocomplete: {
  //     keys: ["Shift+Tab", "Shift+Tab"],
  //     description: "Reverse the autocomplete suggestion",
  //   },
  //   navigateMessageHistory: {
  //     keys: ["Ctrl+↑ / Ctrl+↓", "⌘+↑ / ⌘+↓"],
  //     description: "Navigate through previous messages",
  //   },
  // },
  // mediaAI: {
  //   startStopRecording: {
  //     keys: ["Ctrl+R", "⌘+R"],
  //     description: "Start or stop recording audio",
  //   },
  //   pauseResumeRecording: {
  //     keys: ["Ctrl+Shift+R", "⌘+Shift+R"],
  //     description: "Pause or resume audio recording",
  //   },
  //   uploadImage: {
  //     keys: ["Ctrl+I", "⌘+I"],
  //     description: "Upload an image",
  //   },
  //   generateSuggestions: {
  //     keys: ["Ctrl+G", "⌘+G"],
  //     description: "Generate AI suggestions",
  //   },
  //   Autocomplete: {
  //     keys: ["Ctrl+Shift+A", "⌘+Shift+A"],
  //     description: "Trigger AI autocomplete",
  //   },
  // },
  powerUser: {
    // showMoodTrends: {
    //   keys: ["Ctrl+Shift+M", "⌘+Shift+M"],
    //   description: "Show mood trends over time",
    // },
    // exportEntry: {
    //   keys: ["Ctrl+Shift+E", "⌘+Shift+E"],
    //   description: "Export the current entry",
    // },
    // jumpToToday: {
    //   keys: ["Ctrl+Shift+J", "⌘+Shift+J"],
    //   description: "Jump to today's entry",
    // },
    quickCapture: {
      keys: ["Ctrl+Alt+Space", "⌘+Option+Space"],
      description: "Quickly capture a new entry",
    },
  },
};

export default shortcuts;
