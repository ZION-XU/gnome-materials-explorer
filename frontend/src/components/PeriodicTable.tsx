import { ELEMENTS } from "../elements";

interface Props {
  include: string[];
  any: string[];
  exclude: string[];
  onToggle: (symbol: string) => void;
}

export function PeriodicTable({ include, any, exclude, onToggle }: Props) {
  return (
    <div className="ptable">
      {ELEMENTS.map((e) => {
        const state = include.includes(e.symbol)
          ? "include"
          : any.includes(e.symbol)
            ? "any"
            : exclude.includes(e.symbol)
              ? "exclude"
              : e.available
                ? "available"
                : "unavailable";
        return (
          <button
            key={e.symbol}
            className={`cell cell-${state}`}
            style={{ gridColumn: e.group, gridRow: e.period }}
            disabled={!e.available}
            title={`${e.symbol} · ${e.name}`}
            onClick={() => onToggle(e.symbol)}
          >
            {e.symbol}
          </button>
        );
      })}
    </div>
  );
}
