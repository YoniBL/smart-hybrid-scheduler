import React from "react";

export function CalendarSkeleton() {
  return (
    <div className="skeleton-cal">
      <div className="row" />
      <div className="row" />
      <div className="row" />
      <div className="row" />
      <div className="row" />
      <div className="row" />
    </div>
  );
}

export function TasksSkeleton() {
  return (
    <div className="skeleton-tasks">
      <div className="line" />
      <div className="line" />
      <div className="line" />
    </div>
  );
}
