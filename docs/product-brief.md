# Product brief: Version 1

This document records the initial Product-to-PR scope. For the current product
direction and planned outcomes, see [Product vision](product-vision.md) and
[Roadmap](roadmap.md).

## Problem

Product leaders can describe desired outcomes but may struggle to translate them into implementation-ready work. Coding agents can write code, but vague requirements create rework and unsafe changes.

## User

A product contributor who understands the customer and business problem but is still developing technical fluency.

## Version 1

Given a feature request, produce a consistent planning document containing:

- a concise feature summary;
- questions that should be answered before implementation;
- observable acceptance criteria;
- an implementation outline;
- material risks;
- a verification plan.

## Version 1 non-goals

- Inspecting a repository
- Generating or modifying code
- Calling a model API
- Creating Git branches or pull requests
- Coordinating multiple agents

## Success criteria

- A first-time user can run the tool locally.
- The output makes unknowns explicit instead of inventing requirements.
- Every plan includes observable acceptance criteria and verification.
- The core planning behavior is covered by automated tests.

## Original future stages

1. Inspect a repository and identify relevant files.
2. Generate a repository-aware implementation plan.
3. Implement changes on an isolated branch and run tests.
4. Add evaluation rubrics, logs, retries, and approval gates.
5. Add an independent second-model review.

Several of these foundations now exist. The current status and remaining work
are tracked in the [roadmap](roadmap.md).
