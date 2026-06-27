import React from "react";
import {
  getConfigUpdateSnapshot,
  subscribeConfigUpdate,
} from "@/lib/configUpdate";
import devRyanLoadLogoUrl from "@/assets/DevRyanLoad.svg";

export const ConfigUpdateOverlay: React.FC = () => {
  const [{ isUpdating, message }, setState] = React.useState(() => getConfigUpdateSnapshot());

  React.useEffect(() => {
    return subscribeConfigUpdate(setState);
  }, []);

  if (!isUpdating) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-background/90">
      <img src={devRyanLoadLogoUrl} alt="" width={92} height={92} />
      <p className="typography-body text-muted-foreground">
        {message}
      </p>
    </div>
  );
};
