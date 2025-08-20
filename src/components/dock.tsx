"use client";

import {
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
  AnimatePresence,
} from "framer-motion";
import React, {
  Children,
  cloneElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";

export type DockItemData = {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick?: () => void;
  path?: string;
  className?: string;
};

export type DockProps = {
  items: DockItemData[];
  className?: string;
  distance?: number;
  panelHeight?: number;
  baseItemSize?: number;
  dockHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
};

type DockItemProps = {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  mouseX: MotionValue<number>;
  spring: SpringOptions;
  distance: number;
  baseItemSize: number;
  magnification: number;
  isActive: boolean;
};

function DockItem({
  children,
  className = "",
  onClick,
  mouseX,
  spring,
  distance,
  magnification,
  baseItemSize,
  isActive,
}: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize,
    };
    return val - rect.x - baseItemSize / 2;
  });

  const targetSize = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [baseItemSize, magnification, baseItemSize]
  );
  const size = useSpring(targetSize, spring);

  return (
    <motion.div
      ref={ref}
      style={{ width: size, height: size }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      onClick={onClick}
      className={clsx(
        "relative inline-flex items-center justify-center rounded-2xl border-border-light dark:border-border-dark border-1 shadow-md transition-colors",
        {
          "bg-info": isActive,
          "bg-surface-light dark:bg-surface-dark": !isActive,
        },
        className
      )}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
    >
      {Children.map(children, (child) =>
        cloneElement(child as React.ReactElement, { isHovered, isActive })
      )}
    </motion.div>
  );
}

type DockLabelProps = {
  className?: string;
  children: React.ReactNode;
};

function DockLabel({ children, className = "", ...rest }: DockLabelProps) {
  const { isHovered } = rest as { isHovered: MotionValue<number> };
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const unsub = isHovered.on("change", (latest) =>
      setIsVisible(latest === 1)
    );
    return () => unsub();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.2 }}
          className={clsx(
            "absolute -top-6 left-1/2 w-fit whitespace-pre rounded-md border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-2 py-0.5 text-xs text-text-light dark:text-text-dark",
            className
          )}
          role="tooltip"
          style={{ x: "-50%" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type DockIconProps = {
  className?: string;
  children: React.ReactNode;
};

function DockIcon({ children, className = "", ...rest }: DockIconProps) {
  const { isActive } = rest as { isActive?: boolean };
  return (
    <div
      className={clsx(
        "flex items-center justify-center transition-colors",
        {
          "text-white": isActive,
          "text-text-light-sub dark:text-text-dark-sub": !isActive,
        },
        className
      )}
    >
      {children}
    </div>
  );
}

export default function Dock({
  items,
  className = "",
  spring = { mass: 0.1, stiffness: 150, damping: 18 },
  magnification = 70,
  distance = 200,
  panelHeight = 64,
  dockHeight = 256,
  baseItemSize = 50,
}: DockProps) {
  const PILL_HEIGHT = 8;
  const PILL_WIDTH = 160;
  const INITIAL_VISIBLE_MS = 5000;
  const COLLAPSE_DELAY_MS = 500;

  const mouseX = useMotionValue<number>(Infinity);
  const [expanded, setExpanded] = useState(true);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useNavigate();
  const { pathname } = useLocation();

  const openMV = useMotionValue<number>(expanded ? 1 : 0);
  useEffect(() => {
    openMV.set(expanded ? 1 : 0);
    if (!expanded) mouseX.set(Infinity);
  }, [expanded, openMV, mouseX]);

  const maxOuterHeight = useMemo(
    () => Math.max(dockHeight, magnification + magnification / 2 + 4),
    [magnification, dockHeight]
  );

  const outerHeight = useSpring(
    useTransform(openMV, [0, 1], [PILL_HEIGHT, maxOuterHeight]),
    spring
  );
  const innerHeight = useSpring(
    useTransform(openMV, [0, 1], [PILL_HEIGHT, panelHeight]),
    spring
  );
  const padX = useSpring(useTransform(openMV, [0, 1], [8, 16]), spring);
  const padY = useSpring(useTransform(openMV, [0, 1], [0, 8]), spring);
  const radius = useSpring(useTransform(openMV, [0, 1], [999, 16]), spring);

  const initialBg = useTransform(openMV, (val) => {
    // when collapsed: black (light), white (dark)
    // when expanded: normal theme base
    return val === 0
      ? "bg-black dark:bg-white"
      : "bg-base-light dark:bg-base-dark";
  });

  useEffect(() => {
    initialTimerRef.current = setTimeout(
      () => setExpanded(false),
      INITIAL_VISIBLE_MS
    );
    return () => {
      if (initialTimerRef.current) clearTimeout(initialTimerRef.current);
    };
  }, []);

  const clearCollapseTimer = () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  };

  const handleMouseMove = ({ pageX }: { pageX: number }) => {
    clearCollapseTimer();
    if (!expanded) setExpanded(true);
    mouseX.set(pageX);
  };

  const handleMouseLeave = () => {
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(
      () => setExpanded(false),
      COLLAPSE_DELAY_MS
    );
  };

  return (
    <motion.div
      style={{ height: outerHeight }}
      className="flex max-w-full items-center z-50"
    >
      <motion.div
        layout
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={clsx(
          className,
          "absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end w-fit gap-4",
          "transition-colors duration-300",
          expanded &&
            "border-1 rounded-2xl border-border-light dark:border-border-dark backdrop-blur-md"
        )}
        style={{
          height: innerHeight,
          paddingLeft: padX,
          paddingRight: padX,
          paddingTop: padY,
          paddingBottom: padY,
          borderRadius: radius,
        }}
        role="toolbar"
        aria-label="Application dock"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {expanded ? (
            <motion.div
              key="dock-items"
              layout
              className="flex items-end gap-4"
              initial={{ opacity: 0, scale: 0.98, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.18 }}
            >
              {items.map((item, index) => {
                const isActive = item.path ? pathname === item.path : false;
                const handleClick = () => {
                  if (item.path) navigate(item.path);
                  if (item.onClick) item.onClick();
                };

                return (
                  <DockItem
                    key={index}
                    onClick={handleClick}
                    className={item.className}
                    mouseX={mouseX}
                    spring={spring}
                    distance={distance}
                    magnification={magnification}
                    baseItemSize={baseItemSize}
                    isActive={isActive}
                  >
                    <DockIcon>{item.icon}</DockIcon>
                    <DockLabel>{item.label}</DockLabel>
                  </DockItem>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key="pill"
              initial={{ opacity: 0, scaleX: 0.7 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0, scaleX: 0.7 }}
              transition={{ duration: 0.22 }}
              className={clsx(
                "mx-auto",
                "w-[160px] h-[8px]",
                "rounded-full",
                "bg-black dark:bg-white"
              )}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
