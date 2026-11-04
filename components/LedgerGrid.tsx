"use client";

import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { formatMoney } from "@/lib/money";
import { chargeStatusLabel } from "@/lib/labels";
import type { Charge, Expense } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  backgroundColor: "#fffdf8",
  foregroundColor: "#1b2420",
  headerBackgroundColor: "#efe8d8",
  headerTextColor: "#1b2420",
  accentColor: "#1e6b45",
  borderColor: "#e2d9c8",
  fontFamily: "inherit",
});

export function ExpenseGrid({ expenses }: { expenses: Expense[] }) {
  const [colDefs] = useState<ColDef<Expense>[]>([
    { field: "description", headerName: "Expense", flex: 1.4, minWidth: 140 },
    {
      field: "amountCents",
      headerName: "Amount",
      width: 120,
      valueFormatter: (params) => formatMoney(params.value as number),
    },
    { field: "payer", headerName: "Paid by", width: 130 },
    {
      field: "participants",
      headerName: "Split among",
      flex: 1.4,
      minWidth: 160,
      valueFormatter: (params) => (params.value as string[]).join(", "),
    },
  ]);
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true }), []);

  return (
    <div className="grid-wrap" data-testid="expense-grid">
      <AgGridReact
        theme={theme}
        rowData={expenses}
        columnDefs={colDefs}
        defaultColDef={defaultColDef}
        domLayout="autoHeight"
        getRowId={(params) => `${params.data.description}-${params.data.amountCents}-${params.data.payer}`}
      />
    </div>
  );
}

export function ChargeGrid({ charges }: { charges: Charge[] }) {
  const [colDefs] = useState<ColDef<Charge>[]>([
    { field: "from", headerName: "From", width: 130 },
    { field: "to", headerName: "To", width: 130 },
    {
      field: "amountCents",
      headerName: "Amount",
      width: 120,
      valueFormatter: (params) => formatMoney(params.value as number),
    },
    {
      headerName: "Status",
      flex: 1.2,
      minWidth: 220,
      valueGetter: (params) => (params.data ? chargeStatusLabel(params.data) : ""),
    },
    {
      headerName: "PayPal",
      flex: 1.3,
      minWidth: 220,
      valueGetter: (params) => {
        const paypal = params.data?.paypal;
        if (!paypal) return "Not created";
        return paypal.mode === "mock" ? `Simulated ${paypal.kind} ${paypal.id}` : `Sandbox ${paypal.kind} ${paypal.id}`;
      },
    },
  ]);
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true }), []);

  return (
    <div className="grid-wrap" data-testid="ledger-grid">
      <AgGridReact
        theme={theme}
        rowData={charges}
        columnDefs={colDefs}
        defaultColDef={defaultColDef}
        domLayout="autoHeight"
        getRowId={(params) => params.data.id}
      />
    </div>
  );
}
