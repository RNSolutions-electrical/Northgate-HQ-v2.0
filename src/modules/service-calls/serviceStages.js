// Compatibility defaults for the built-in stages. Live catalogue values override these.
export const DEFAULT_SERVICE_STAGES = Object.freeze([
  {
    "key": "pursuit",
    "label": "Pursuit",
    "background_color": "#FFF9C4",
    "kind": "work",
    "job_status": "active",
    "strikethrough": false,
    "sort_order": 0
  },
  {
    "key": "proposal_sent",
    "label": "Proposal Sent",
    "background_color": "#FFEB3B",
    "kind": "work",
    "job_status": "active",
    "strikethrough": false,
    "sort_order": 1
  },
  {
    "key": "upcoming",
    "label": "Upcoming",
    "background_color": "#FFFFFF",
    "kind": "work",
    "job_status": "active",
    "strikethrough": false,
    "sort_order": 2
  },
  {
    "key": "in_progress",
    "label": "In progress",
    "background_color": "#FFFFFF",
    "kind": "work",
    "job_status": "active",
    "strikethrough": false,
    "sort_order": 3
  },
  {
    "key": "complete",
    "label": "Complete / ready to invoice",
    "background_color": "#FFE0B2",
    "kind": "work",
    "job_status": "complete",
    "strikethrough": false,
    "sort_order": 4
  },
  {
    "key": "not_proceeding",
    "label": "Not Proceeding",
    "background_color": "#E0E0E0",
    "kind": "work",
    "job_status": "cancelled",
    "strikethrough": true,
    "sort_order": 5
  },
  {
    "key": "void",
    "label": "Void",
    "background_color": "#000000",
    "kind": "work",
    "job_status": "cancelled",
    "strikethrough": true,
    "sort_order": 6
  },
  {
    "key": "warranty",
    "label": "Warranty Work",
    "background_color": "#D6ECFF",
    "kind": "work",
    "job_status": "active",
    "strikethrough": false,
    "sort_order": 7
  },
  {
    "key": "pro_bono",
    "label": "Pro-Bono / Donation",
    "background_color": "#78B4E8",
    "kind": "work",
    "job_status": "active",
    "strikethrough": false,
    "sort_order": 8
  },
  {
    "key": "invoice_sent",
    "label": "Invoice Sent",
    "background_color": "#D9EED5",
    "kind": "derived",
    "job_status": "active",
    "strikethrough": false,
    "sort_order": 9
  },
  {
    "key": "payment_received",
    "label": "Payment Received",
    "background_color": "#65E572",
    "kind": "derived",
    "job_status": "active",
    "strikethrough": false,
    "sort_order": 10
  },
  {
    "key": "archived",
    "label": "Archived",
    "background_color": "#FADADD",
    "kind": "derived",
    "job_status": "active",
    "strikethrough": false,
    "sort_order": 11
  }
]);
export const noChargeStage = call => ['warranty','pro_bono'].includes(call?.profile?.work_stage);
export function stageTextColor(background) {
 if (!/^#[0-9a-f]{6}$/i.test(background || '')) return '#111111';
 const rgb=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 const light=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
 return (light+.05)/.05 >= 1.05/(light+.05) ? '#000000' : '#FFFFFF';
}
export function stageRowStyle(stage) {
 const bg=/^#[0-9a-f]{6}$/i.test(stage?.background_color || '')?stage.background_color:'#FFFFFF';
 return {'--svc-stage-bg':bg,'--svc-stage-fg':stageTextColor(bg),'--svc-stage-decoration':stage?.strikethrough?'line-through':'none'};
}
