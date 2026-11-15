import red_0 from "./red_0.svg";
import red_1 from "./red_1.svg";
import red_2 from "./red_2.svg";
import red_3 from "./red_3.svg";
import red_4 from "./red_4.svg";
import red_5 from "./red_5.svg";
import red_6 from "./red_6.svg";
import red_7 from "./red_7.svg";
import red_8 from "./red_8.svg";
import red_9 from "./red_9.svg";
import red_skip from "./red_skip.svg";
import red_reverse from "./red_reverse.svg";
import red_draw2 from "./red_draw2.svg";
import blue_0 from "./blue_0.svg";
import blue_1 from "./blue_1.svg";
import blue_2 from "./blue_2.svg";
import blue_3 from "./blue_3.svg";
import blue_4 from "./blue_4.svg";
import blue_5 from "./blue_5.svg";
import blue_6 from "./blue_6.svg";
import blue_7 from "./blue_7.svg";
import blue_8 from "./blue_8.svg";
import blue_9 from "./blue_9.svg";
import blue_skip from "./blue_skip.svg";
import blue_reverse from "./blue_reverse.svg";
import blue_draw2 from "./blue_draw2.svg";
import yellow_0 from "./yellow_0.svg";
import yellow_1 from "./yellow_1.svg";
import yellow_2 from "./yellow_2.svg";
import yellow_3 from "./yellow_3.svg";
import yellow_4 from "./yellow_4.svg";
import yellow_5 from "./yellow_5.svg";
import yellow_6 from "./yellow_6.svg";
import yellow_7 from "./yellow_7.svg";
import yellow_8 from "./yellow_8.svg";
import yellow_9 from "./yellow_9.svg";
import yellow_skip from "./yellow_skip.svg";
import yellow_reverse from "./yellow_reverse.svg";
import yellow_draw2 from "./yellow_draw2.svg";
import green_0 from "./green_0.svg";
import green_1 from "./green_1.svg";
import green_2 from "./green_2.svg";
import green_3 from "./green_3.svg";
import green_4 from "./green_4.svg";
import green_5 from "./green_5.svg";
import green_6 from "./green_6.svg";
import green_7 from "./green_7.svg";
import green_8 from "./green_8.svg";
import green_9 from "./green_9.svg";
import green_skip from "./green_skip.svg";
import green_reverse from "./green_reverse.svg";
import green_draw2 from "./green_draw2.svg";
import wildCard from "./wild.svg";
import wild4Card from "./wild4.svg";
import unoBack from "./back.svg";

const UNO_CARD_ASSET_MAP: Record<string, string> = {
  "red_0": red_0,
  "red_1": red_1,
  "red_2": red_2,
  "red_3": red_3,
  "red_4": red_4,
  "red_5": red_5,
  "red_6": red_6,
  "red_7": red_7,
  "red_8": red_8,
  "red_9": red_9,
  "red_skip": red_skip,
  "red_reverse": red_reverse,
  "red_draw2": red_draw2,
  "blue_0": blue_0,
  "blue_1": blue_1,
  "blue_2": blue_2,
  "blue_3": blue_3,
  "blue_4": blue_4,
  "blue_5": blue_5,
  "blue_6": blue_6,
  "blue_7": blue_7,
  "blue_8": blue_8,
  "blue_9": blue_9,
  "blue_skip": blue_skip,
  "blue_reverse": blue_reverse,
  "blue_draw2": blue_draw2,
  "yellow_0": yellow_0,
  "yellow_1": yellow_1,
  "yellow_2": yellow_2,
  "yellow_3": yellow_3,
  "yellow_4": yellow_4,
  "yellow_5": yellow_5,
  "yellow_6": yellow_6,
  "yellow_7": yellow_7,
  "yellow_8": yellow_8,
  "yellow_9": yellow_9,
  "yellow_skip": yellow_skip,
  "yellow_reverse": yellow_reverse,
  "yellow_draw2": yellow_draw2,
  "green_0": green_0,
  "green_1": green_1,
  "green_2": green_2,
  "green_3": green_3,
  "green_4": green_4,
  "green_5": green_5,
  "green_6": green_6,
  "green_7": green_7,
  "green_8": green_8,
  "green_9": green_9,
  "green_skip": green_skip,
  "green_reverse": green_reverse,
  "green_draw2": green_draw2,
  "wild_wild": wildCard,
  "wild_wild4": wild4Card,
};

export const UNO_CARD_BACK_SRC = unoBack;

export function getUnoCardSvgSrc(color: string, value: string): string {
  if (value === "wild") return UNO_CARD_ASSET_MAP["wild_wild"];
  if (value === "wild4") return UNO_CARD_ASSET_MAP["wild_wild4"];
  const key = `${color}_${value}`;
  return UNO_CARD_ASSET_MAP[key] || unoBack;
}
