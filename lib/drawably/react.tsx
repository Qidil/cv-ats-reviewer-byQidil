"use client";

import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import {
  type ButtonSketch,
  type DrawablyBadgeOptions,
  type DrawablyButtonOptions,
  type DrawablyListOptions,
  type DrawablyOptions,
  drawablyArrow,
  drawablyBadge,
  drawablyButton,
  drawablyCard,
  drawablyCheckbox,
  drawablyCircle,
  drawablyDivider,
  drawablyHighlight,
  drawablyInput,
  drawablyList,
  drawablyRadio,
  drawablySelect,
  drawablyTextarea,
  drawablyToggle,
  drawablyUnderline,
  type Sketch,
} from "./controls";
import {
  type DrawablyPagerOptions,
  type DrawablyTabsOptions,
  drawablyAlert,
  drawablyChip,
  drawablyKbd,
  drawablyPager,
  drawablyQuote,
  drawablySteps,
  drawablyTabs,
  drawablyTooltip,
  type PagerSketch,
  type TabsSketch,
} from "./composites";

function useSketch<T extends HTMLElement>(
  attach: (el: T) => Sketch,
  deps: readonly unknown[],
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!ref.current) return;
    const sketch = attach(ref.current);
    return () => sketch.destroy();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

export type DrawablyButtonProps = DrawablyButtonOptions & ComponentProps<"button">;

export function DrawablyButton({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  variant,
  state,
  tone,
  className,
  children,
  ...rest
}: DrawablyButtonProps): ReactElement {
  const sketchRef = useRef<ButtonSketch | null>(null);
  const ref = useSketch<HTMLButtonElement>(
    (el) =>
      (sketchRef.current = drawablyButton(el, {
        seed,
        roughness,
        boil,
        stroke,
        fill,
        paper,
        width,
        variant,
        state,
        tone,
      })),
    [seed, roughness, boil, stroke, fill, paper, width, variant, tone, className],
  );
  useEffect(() => {
    sketchRef.current?.setState(state ?? "idle");
  }, [state]);
  return (
    <button type="button" {...rest} className={className} ref={ref}>
      {children}
    </button>
  );
}

export type DrawablyCheckboxProps = DrawablyOptions & ComponentProps<"input">;

export function DrawablyCheckbox({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  ...rest
}: DrawablyCheckboxProps): ReactElement {
  const ref = useSketch<HTMLSpanElement>(
    (el) => drawablyCheckbox(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <span className={className} ref={ref}>
      <input {...rest} type="checkbox" />
    </span>
  );
}

export type DrawablyInputProps = DrawablyOptions & ComponentProps<"input">;

export function DrawablyInput({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  ...rest
}: DrawablyInputProps): ReactElement {
  const ref = useSketch<HTMLSpanElement>(
    (el) => drawablyInput(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <span className={className} ref={ref}>
      <input {...rest} />
    </span>
  );
}

export function DrawablyRadio({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  ...rest
}: DrawablyInputProps): ReactElement {
  const ref = useSketch<HTMLSpanElement>(
    (el) => drawablyRadio(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <span className={className} ref={ref}>
      <input {...rest} type="radio" />
    </span>
  );
}

export function DrawablyToggle({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  ...rest
}: DrawablyCheckboxProps): ReactElement {
  const ref = useSketch<HTMLSpanElement>(
    (el) => drawablyToggle(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <span className={className} ref={ref}>
      <input {...rest} type="checkbox" role="switch" />
    </span>
  );
}

export type DrawablyDividerProps = DrawablyOptions & ComponentProps<"hr">;

export function DrawablyDivider({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  ...rest
}: DrawablyDividerProps): ReactElement {
  const ref = useSketch<HTMLHRElement>(
    (el) => drawablyDivider(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return <hr {...rest} className={className} ref={ref} />;
}

export type DrawablyCardProps = DrawablyOptions & ComponentProps<"div">;

export function DrawablyCard({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  children,
  ...rest
}: DrawablyCardProps): ReactElement {
  const ref = useSketch<HTMLDivElement>(
    (el) => drawablyCard(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <div {...rest} className={className} ref={ref}>
      {children}
    </div>
  );
}

export type DrawablySpanProps = DrawablyOptions & ComponentProps<"span">;

function decoration(attach: (el: HTMLSpanElement, opts: DrawablyOptions) => Sketch) {
  return function Decoration({
    seed,
    roughness,
    boil,
    stroke,
    fill,
    paper,
    width,
    className,
    children,
    ...rest
  }: DrawablySpanProps): ReactElement {
    const ref = useSketch<HTMLSpanElement>(
      (el) => attach(el, { seed, roughness, boil, stroke, fill, paper, width }),
      [seed, roughness, boil, stroke, fill, paper, width, className],
    );
    return (
      <span {...rest} className={className} ref={ref}>
        {children}
      </span>
    );
  };
}

export const DrawablyUnderline = decoration(drawablyUnderline);
export const DrawablyHighlight = decoration(drawablyHighlight);
export const DrawablyCircle = decoration(drawablyCircle);

export type DrawablyArrowProps = DrawablyOptions & {
  from: RefObject<HTMLElement | null>;
  to: RefObject<HTMLElement | null>;
};

export function DrawablyArrow({
  from,
  to,
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
}: DrawablyArrowProps): null {
  useEffect(() => {
    if (!from.current || !to.current) return;
    const sketch = drawablyArrow(from.current, to.current, { seed, roughness, boil, stroke, fill, paper, width });
    return () => sketch.destroy();
  }, [from, to, seed, roughness, boil, stroke, fill, paper, width]);
  return null;
}

export type DrawablyTextareaProps = DrawablyOptions & ComponentProps<"textarea">;

export function DrawablyTextarea({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  ...rest
}: DrawablyTextareaProps): ReactElement {
  const ref = useSketch<HTMLSpanElement>(
    (el) => drawablyTextarea(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <span className={className} ref={ref}>
      <textarea {...rest} />
    </span>
  );
}

export type DrawablySelectProps = DrawablyOptions & ComponentProps<"select">;

export function DrawablySelect({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  children,
  ...rest
}: DrawablySelectProps): ReactElement {
  const ref = useSketch<HTMLSpanElement>(
    (el) => drawablySelect(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <span className={className} ref={ref}>
      <select {...rest}>{children}</select>
    </span>
  );
}

export type DrawablyBadgeProps = DrawablyBadgeOptions & ComponentProps<"span">;

export function DrawablyBadge({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  variant,
  className,
  children,
  ...rest
}: DrawablyBadgeProps): ReactElement {
  const ref = useSketch<HTMLSpanElement>(
    (el) => drawablyBadge(el, { seed, roughness, boil, stroke, fill, paper, width, variant }),
    [seed, roughness, boil, stroke, fill, paper, width, variant, className],
  );
  return (
    <span {...rest} className={className} ref={ref}>
      {children}
    </span>
  );
}

export type DrawablyListProps = DrawablyListOptions & ComponentProps<"ul">;

export function DrawablyList({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  marker,
  className,
  children,
  ...rest
}: DrawablyListProps): ReactElement {
  const ref = useSketch<HTMLUListElement>(
    (el) => drawablyList(el, { seed, roughness, boil, stroke, fill, paper, width, marker }),
    [seed, roughness, boil, stroke, fill, paper, width, marker, className],
  );
  return (
    <ul {...rest} className={className} ref={ref}>
      {children}
    </ul>
  );
}

export type DrawablyChipProps = DrawablyOptions & ComponentProps<"input"> & { children?: ReactNode };

export function DrawablyChip({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  children,
  ...rest
}: DrawablyChipProps): ReactElement {
  const ref = useSketch<HTMLLabelElement>(
    (el) => drawablyChip(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <label className={className} ref={ref}>
      <span>
        <input {...rest} type="checkbox" />
      </span>
      {children}
    </label>
  );
}

export type DrawablyTabsProps = DrawablyTabsOptions & ComponentProps<"div">;

export function DrawablyTabs({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  active,
  className,
  children,
  ...rest
}: DrawablyTabsProps): ReactElement {
  const sketchRef = useRef<TabsSketch | null>(null);
  const ref = useSketch<HTMLDivElement>(
    (el) => (sketchRef.current = drawablyTabs(el, { seed, roughness, boil, stroke, fill, paper, width, active })),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  useEffect(() => {
    if (active !== undefined) sketchRef.current?.setActive(active);
  }, [active]);
  return (
    <div role="tablist" {...rest} className={className} ref={ref}>
      {children}
    </div>
  );
}

export type DrawablyTooltipProps = DrawablyOptions & ComponentProps<"span"> & { to: RefObject<HTMLElement | null> };

export function DrawablyTooltip({
  to,
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  children,
  ...rest
}: DrawablyTooltipProps): ReactElement {
  const innerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!innerRef.current || !to.current) return;
    const sketch = drawablyTooltip(innerRef.current, to.current, { seed, roughness, boil, stroke, fill, paper, width });
    return () => sketch.destroy();
  }, [to, seed, roughness, boil, stroke, fill, paper, width, className]);
  return (
    <span role="tooltip" {...rest} className={className} ref={innerRef}>
      {children}
    </span>
  );
}

export function DrawablyAlert({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  children,
  ...rest
}: DrawablyCardProps): ReactElement {
  const ref = useSketch<HTMLDivElement>(
    (el) => drawablyAlert(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <div role="status" {...rest} className={className} ref={ref}>
      {children}
    </div>
  );
}

export type DrawablyStepsProps = DrawablyOptions & ComponentProps<"ol">;

export function DrawablySteps({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  children,
  ...rest
}: DrawablyStepsProps): ReactElement {
  const ref = useSketch<HTMLOListElement>(
    (el) => drawablySteps(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <ol {...rest} className={className} ref={ref}>
      {children}
    </ol>
  );
}

export type DrawablyKbdProps = DrawablyBadgeOptions & ComponentProps<"kbd">;

export function DrawablyKbd({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  variant,
  className,
  children,
  ...rest
}: DrawablyKbdProps): ReactElement {
  const ref = useSketch<HTMLElement>(
    (el) => drawablyKbd(el, { seed, roughness, boil, stroke, fill, paper, width, variant }),
    [seed, roughness, boil, stroke, fill, paper, width, variant, className],
  );
  return (
    <kbd {...rest} className={className} ref={ref}>
      {children}
    </kbd>
  );
}

export type DrawablyQuoteProps = DrawablyOptions & ComponentProps<"blockquote">;

export function DrawablyQuote({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  className,
  children,
  ...rest
}: DrawablyQuoteProps): ReactElement {
  const ref = useSketch<HTMLQuoteElement>(
    (el) => drawablyQuote(el, { seed, roughness, boil, stroke, fill, paper, width }),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  return (
    <blockquote {...rest} className={className} ref={ref}>
      {children}
    </blockquote>
  );
}

export type DrawablyPagerProps = DrawablyPagerOptions & ComponentProps<"nav">;

export function DrawablyPager({
  seed,
  roughness,
  boil,
  stroke,
  fill,
  paper,
  width,
  active,
  className,
  children,
  ...rest
}: DrawablyPagerProps): ReactElement {
  const sketchRef = useRef<PagerSketch | null>(null);
  const ref = useSketch<HTMLElement>(
    (el) => (sketchRef.current = drawablyPager(el, { seed, roughness, boil, stroke, fill, paper, width, active })),
    [seed, roughness, boil, stroke, fill, paper, width, className],
  );
  useEffect(() => {
    if (active !== undefined) sketchRef.current?.setPage(active);
  }, [active]);
  return (
    <nav {...rest} className={className} ref={ref}>
      {children}
    </nav>
  );
}
