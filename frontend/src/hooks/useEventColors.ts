import { useCallback, useEffect, useState } from "react";

type ColorMap = Record<string, string>;
const KEY = "eventColors_v1";

function load(): ColorMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function save(map: ColorMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function useEventColors() {
  const [map, setMap] = useState<ColorMap>({});

  useEffect(() => { setMap(load()); }, []);

  const getColor = useCallback((id: string) => map[id] || "", [map]);

  const setColor = useCallback((id: string, color: string) => {
    setMap(prev => {
      const next = { ...prev, [id]: color };
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setMap(prev => {
      const next = { ...prev };
      delete next[id];
      save(next);
      return next;
    });
  }, []);

  return { getColor, setColor, remove, map };
}
