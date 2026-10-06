import React, { useRef, useState } from "react";

const OTPInput = ({
  length = 6,
  onChange,
}: {
  length?: number;
  onChange?: (otp: string) => void;
}) => {
  const [otp, setOtp] = useState<string[]>(Array(length).fill(""));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const focusInput = (index: number) => {
    if (inputs.current[index]) {
      inputs.current[index]?.focus();
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number,
  ) => {
    const value = e.target.value.replace(/[^0-9]/g, "");

    if (!value) return;

    const newOtp = [...otp];
    newOtp[index] = value[0];
    setOtp(newOtp);
    onChange?.(newOtp.join(""));

    // Move to next input
    if (index < length - 1) focusInput(index + 1);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const newOtp = [...otp];
      if (otp[index]) {
        newOtp[index] = "";
        setOtp(newOtp);
        onChange?.(newOtp.join(""));
      } else if (index > 0) {
        newOtp[index - 1] = "";
        setOtp(newOtp);
        focusInput(index - 1);
        onChange?.(newOtp.join(""));
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      focusInput(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      focusInput(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteData = e.clipboardData
      .getData("text")
      .replace(/[^0-9]/g, "")
      .slice(0, length);
    const newOtp = [...otp];
    for (let i = 0; i < pasteData.length; i++) {
      newOtp[i] = pasteData[i];
    }
    setOtp(newOtp);
    onChange?.(newOtp.join(""));
    focusInput(Math.min(pasteData.length, length - 1));
  };

  return (
    <div className="flex gap-2">
      {otp.map((digit, index) => (
        <input
          key={index}
          type="text"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onPaste={handlePaste}
          ref={(el: HTMLInputElement | null) => {
            inputs.current[index] = el;
          }}
          className="w-10 h-12 text-center text-lg border border-gray-400 rounded focus:outline-blue-500"
        />
      ))}
    </div>
  );
};

export default OTPInput;
