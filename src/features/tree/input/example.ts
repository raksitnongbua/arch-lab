/**
 * The playground's starter tree, kept as `.alab` TEXT rather than as a model
 * object so it goes through the real parser on every load — the rule every
 * kind's seed follows here. A seed that bypassed the grammar could drift into
 * something the format no longer accepts and nothing would notice.
 *
 * IT IS A TEST PLAN because that is the shape the notation was asked for, and
 * because it exercises the two things a plain hierarchy does not: four levels
 * of nesting, and leaf columns carrying prose of real length.
 */
export const TREE_EXAMPLE = `archlab 1.0 tree
title "Account recovery reviews"
description "Supervisor review queue, decomposed into the cases that prove it."

@tree
  columns "Preconditions" "Expected result"
  node suite "Account recovery reviews"
    desc "Reviews list and review detail, supervisor role."
    node list "Reviews list"
      node access "Reaching the page"
        node L-01 "A supervisor can open Reviews"
          cell "A supervisor account"
          cell "The queue table renders with its filter panel"
        node L-02 "An agent is refused at the API"
          cell "An agent account with no Reviews right, and a live token"
          cell "Refused by the server, not by a hidden menu"
      node claim "Claiming a case"
        node L-11 "Claiming assigns the case to you"
          cell "An unassigned ticket"
          cell "The assignee changes with no refresh"
        node L-12 "Two supervisors claim at once"
          cell "One unassigned ticket, two sessions holding it open"
          cell "Only the first wins, and the audit log has one entry"
    node detail "Review detail"
      node decide "Recording a decision"
        node D-08 "All three outcomes are offered"
          cell "A ticket you own"
          cell "Approve, reject and return are all selectable"
        node D-09 "Rejecting needs a reason"
          cell "A ticket you own"
          cell "Update is refused, and the reason reaches the audit log"
      node guard "Guarding against overwrites"
        node D-14 "A decided ticket is read-only"
          cell "One decided ticket of each outcome"
          cell "No control offered, and the API refuses a second decision"
        node D-16 "A stale screen cannot overwrite"
          cell "A ticket held open while another supervisor decides it"
          cell "The first decision stands"
    node gaps "Not covered by the acceptance criteria"
      node C-02 "Evidence links must be https"
        cell "Links using http, javascript and data schemes"
        cell "Only https is accepted"
      node C-03 "Attachments are limited by type and size"
        cell "A .docx, a file over the limit, and a renamed PDF"
        cell "Only the permitted types and sizes are stored"
`;
