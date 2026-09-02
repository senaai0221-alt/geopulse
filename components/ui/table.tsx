import * as React from "react";

import { cn } from "@/lib/utils";

// Classic no-JS "scrolling shadows" recipe (CSS-Tricks): two solid-color
// gradients scroll WITH the content (background-attachment: local) and
// mask themselves once there's nothing left to scroll toward on that
// side, layered under two darker gradients that stay fixed to the
// viewport edge (background-attachment: scroll) as the actual shadow.
// Net effect: a fade appears on whichever edge still has more table to
// reveal, and disappears on its own once you've scrolled that far - no
// scroll-position listener needed. This is exactly the cue the ranking
// table's per-LLM columns were missing on mobile (they're just cut off
// at the viewport edge with nothing suggesting there's more to swipe
// to). Self-adapting to every Table in the app, including ones that
// never overflow at all - the "scroll" gradients simply sit off-screen
// and never render anything when the content already fits.
const SCROLL_SHADOW_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, hsl(var(--card)) 30%, transparent), " +
    "linear-gradient(to left, hsl(var(--card)) 30%, transparent), " +
    "linear-gradient(to right, hsl(var(--foreground) / 0.14), transparent), " +
    "linear-gradient(to left, hsl(var(--foreground) / 0.14), transparent)",
  backgroundPosition: "left center, right center, left center, right center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "24px 100%, 24px 100%, 10px 100%, 10px 100%",
  backgroundAttachment: "local, local, scroll, scroll",
};

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-auto" style={SCROLL_SHADOW_STYLE}>
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-11 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
