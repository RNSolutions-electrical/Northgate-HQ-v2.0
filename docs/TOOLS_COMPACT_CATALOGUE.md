# Tools Compact Catalogue

September 6, 2026 UI pass. No schema, permission, custody, or audit write changes.

- Catalogue rows start collapsed and show only Tool #, category, and model.
  One row expands at a time; clicking it again collapses it. Search/filter changes
  clear the expansion. Existing detail tabs, history, and authorized actions remain.
- Add a tool opens a dedicated module view. The catalogue and its navigation are
  not displayed alongside the form. The form is absent until explicitly opened.
- Successful creation returns to the active catalogue, clears search and expansion,
  and shows a saved confirmation. Cancel returns without saving and clears the draft.
- Failed saves keep the module open with entered values and the error visible.
- Editing uses the same dedicated view. Archive reason and archive/restore actions
  remain accessible there, since the catalogue actions are hidden while editing.
- Add/Edit/Archive visibility retains existing permission and division checks.

Validation: 15 Node tests; production build; diff whitespace check; actual Tools
component mocked-transport browser tests at 1440, 768, and 390 pixels. Browser
tests cover collapsed identifiers, single expansion, cancel, successful create,
failed-save draft retention, audit calls, edit, archive, readonly controls, and
horizontal overflow. Screenshots inspected. No production tools were created.

Manual acceptance: refresh Tools, expand/collapse a row, open Add a tool and cancel,
then create a real tool when appropriate and verify return to the catalogue.
Inventory desktop/tablet acceptance from the previous pass remains pending Ryan's check.
