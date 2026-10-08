import type { SelectHTMLAttributes } from "react";
import chevron from "../assets/icons/frame-chevron-down.svg";

export function FrameSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className="table-frame-select"><select {...props} /><img src={chevron} alt="" width="10" height="10" /></span>;
}
