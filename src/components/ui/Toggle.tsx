import { Switch } from "@/components/ui/switch";

interface SettingToggleProps {
  label: string;
  value: boolean;
  onChange: (checked: boolean) => void;
}

const SettingToggle = ({ label, value, onChange }: SettingToggleProps) => (
  <div className="flex items-center justify-between">
    <label className="font-medium">{label}</label>
    <Switch checked={value} onCheckedChange={onChange} />
  </div>
);

export default SettingToggle;