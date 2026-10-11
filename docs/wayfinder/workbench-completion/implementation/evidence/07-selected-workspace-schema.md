# 07: Selected workspace generation schema

Status: verified implementation slice; actual model/browser acceptance remains parent-owned and this evidence does not close ticket 07.

The parent observed a real model returning otherwise valid application JSON without workspace, which the Host correctly rejected as differing from the selected target. Inspection found contradictory model guidance: prose required the selected workspace, but the supplied generic recipe schema marked workspace optional.

The model-facing generation schema now derives an extended recipe schema only when a trusted workspace target exists: workspace is required and constrained to that exact target. The generic recipe schema remains optional for manual/legacy recipes. Host path validation, trusted workspace lookup, output parsing and CAS are unchanged; omitted or substituted model workspace is never repaired or silently accepted.

The new native-request-boundary regression first failed because required.workspace was false for a selected target (RED). After the change, it verifies both selected and absent workspace targets, exact const guidance, and unchanged generic schema. All 18 generation-native tests and source types pass. These tests use the official native Session/Agent/loop with a declared model adapter fixture; they prove model-facing guidance and Host guard behavior, not actual model generation success.

Remaining recovery observations: GenerationEditor currently keeps requirement/job in component state, so browser refresh loses active-job controls. Host generation jobs are also in-memory; cold restart loses job status. Completed recipe persistence does not prove active-generation recovery. A future recovery slice must query the original job, preserve its Session identity and explicitly report unavailable jobs without silently starting a new model request or accepting fabricated completion.
