import unittest
from arqdor_feature_contracts import (
    opening_review_dashboard, summarize_opening_review_history, record_opening_review_decision, create_opening_review_queue, inspect_import_request, validate_camera_path, bim_review_manifest, resolve_render_preset, validate_postproduction, validate_conversion_request, suggest_architectural_classification, suggest_geometry_role, propose_opening_hosts, preview_scale_calibration, draft_opening_schedule, evaluate_wall_mesh_topology, inspect_boundary_loops, associate_boundary_candidates, build_opening_review_queue,
)


class FeatureContractsTests(unittest.TestCase):
    def test_glb_only_direct_import(self):
        self.assertTrue(inspect_import_request("residencia.glb")["directImportEnabled"])
        for extension in ("skp", "ifc", "obj", "fbx", "gltf"):
            record = inspect_import_request("residencia." + extension)
            self.assertFalse(record["directImportEnabled"])
            self.assertTrue(record["geometryReviewRequired"])

    def test_reject_unknown_format(self):
        with self.assertRaises(ValueError):
            inspect_import_request("model.exe")

    def test_camera_path_is_ordered_and_bounded(self):
        path = [
            {"second": 0, "position": [1, 2, 3], "target": [0, 0, 0]},
            {"second": 3, "position": [4, 2, 3], "target": [0, 0, 0]},
        ]
        self.assertEqual(validate_camera_path(path)["frames"], 73)
        with self.assertRaises(ValueError):
            validate_camera_path(path[::-1])
        with self.assertRaises(ValueError):
            validate_camera_path(path, fps=100)

    def test_video_limit_prevents_unbounded_worker_render(self):
        long_path = [
            {"second": 0, "position": [0, 1, 2], "target": [0, 0, 0]},
            {"second": 40, "position": [2, 1, 2], "target": [0, 0, 0]},
        ]
        with self.assertRaises(ValueError):
            validate_camera_path(long_path, fps=24)
        short_path = [{**long_path[0]}, {**long_path[1], "second": 29}]
        self.assertEqual(validate_camera_path(short_path, fps=24)["frames"], 697)

    def test_4k_and_print_presets(self):
        self.assertEqual(resolve_render_preset({"qualityPreset": "4k"}), ([3840, 2160], 256))
        self.assertEqual(resolve_render_preset({"qualityPreset": "print"}), ([5760, 3240], 512))
        self.assertEqual(resolve_render_preset({"qualityPreset": "preview"}), ([960, 540], 16))
        self.assertEqual(resolve_render_preset({"qualityPreset": "4k", "samples": 32}), ([3840, 2160], 32))
        with self.assertRaises(ValueError):
            resolve_render_preset({"qualityPreset": "imaginary"})
        with self.assertRaises(ValueError):
            resolve_render_preset({"resolution": [100000, 100000]})
        with self.assertRaises(ValueError):
            resolve_render_preset({"samples": True})

    def test_optional_postproduction_and_bounds(self):
        self.assertEqual(validate_postproduction(None), {"exposure": 0, "gamma": 1})
        self.assertEqual(validate_postproduction({"exposure": 1.25, "gamma": 1.1}),
                         {"exposure": 1.25, "gamma": 1.1})
        with self.assertRaises(ValueError):
            validate_postproduction({"gamma": 0})
        with self.assertRaises(ValueError):
            validate_postproduction({"exposure": float("inf")})

    def test_obj_fbx_require_review_before_render(self):
        digest = "ab" * 32
        for extension in ("obj", "fbx"):
            report = validate_conversion_request("house." + extension, 4096, digest)
            self.assertFalse(report["approvedForRender"])
            self.assertTrue(report["geometryReviewRequired"])
        for extension in ("skp", "ifc", "exe"):
            with self.assertRaises(ValueError):
                validate_conversion_request("house." + extension, 4096, digest)
        with self.assertRaises(ValueError):
            validate_conversion_request("house.fbx", 0, digest)
        with self.assertRaises(ValueError):
            validate_conversion_request("house.obj", 4096, "../not-a-sha")

    def test_architectural_hints_require_review(self):
        for name, expected in (("Parede Externa", "wall"), ("Laje Superior", "slab"),
                               ("Porta Principal", "door"), ("Janela Cozinha", "window"),
                               ("Cobertura", "roof"), ("Pilar 01", "column")):
            hint = suggest_architectural_classification(name)
            self.assertEqual(hint["suggestedClass"], expected)
            self.assertFalse(hint["quantitiesEnabled"])
            self.assertEqual(hint["classificationStatus"], "unverified_name_hint")
        for name in ("Mesh 001", "Parede Janela"):
            hint = suggest_architectural_classification(name)
            self.assertIsNone(hint["suggestedClass"])
            self.assertEqual(hint["classificationStatus"], "manual_review_required")

    def test_geometry_hints_are_only_candidates(self):
        panel = suggest_geometry_role([4.0, 0.15, 2.8])
        self.assertEqual(panel["shapeHint"], "thin_panel_candidate")
        self.assertFalse(panel["geometryVerified"])
        self.assertFalse(panel["quantitiesEnabled"])
        member = suggest_geometry_role([0.15, 0.15, 3.0])
        self.assertEqual(member["shapeHint"], "linear_member_candidate")
        self.assertIsNone(suggest_geometry_role([2.0, 2.0, 2.0])["shapeHint"])
        for invalid in ([1, -1, 2], [1, float("nan"), 3], [1, 2]):
            with self.assertRaises(ValueError):
                suggest_geometry_role(invalid)

    def test_wall_opening_overlap_is_unverified(self):
        wall = {"name": "Parede A", "suggestedClass": "wall",
                "bounds": {"min": [0, 0, 0], "max": [4, 0.2, 3]}}
        window = {"name": "Janela A", "suggestedClass": "window",
                  "bounds": {"min": [1, 0.1, 1], "max": [2, 0.3, 2]}}
        remote = {"name": "Porta distante", "suggestedClass": "door",
                  "bounds": {"min": [20, 0, 0], "max": [21, 1, 2]}}
        result = propose_opening_hosts([wall, window, remote])
        self.assertEqual(result[0]["candidateWalls"], ["Parede A"])
        self.assertEqual(result[0]["hostRelationStatus"], "single_spatial_candidate")
        self.assertTrue(result[0]["requiresManualReview"])
        self.assertEqual(result[1]["hostRelationStatus"], "no_spatial_candidate")
        self.assertFalse(result[0]["openingDetected"])
        self.assertEqual(result[1]["candidateWalls"], [])
        with self.assertRaises(ValueError):
            propose_opening_hosts([{"name": "bad", "bounds": {"min": [2, 0, 0], "max": [1, 1, 1]}}])

    def test_ambiguous_wall_hosts_never_approve_opening(self):
        wall_a = {"name": "Parede A", "suggestedClass": "wall",
                  "bounds": {"min": [0, 0, 0], "max": [4, 0.2, 3]}}
        wall_b = {"name": "Parede B", "suggestedClass": "wall",
                  "bounds": {"min": [0, 0.1, 0], "max": [4, 0.3, 3]}}
        opening = {"name": "Janela", "suggestedClass": "window",
                   "bounds": {"min": [1, 0.1, 1], "max": [2, 0.2, 2]}}
        candidate = propose_opening_hosts([wall_a, wall_b, opening])[0]
        self.assertEqual(candidate["hostRelationStatus"], "ambiguous_spatial_candidates")
        self.assertEqual(candidate["candidateWalls"], ["Parede A", "Parede B"])
        self.assertTrue(candidate["requiresManualReview"])
        self.assertFalse(candidate["openingDetected"])
        self.assertFalse(candidate["quantitiesEnabled"])

    def test_scale_reference_remains_unapproved(self):
        preview = preview_scale_calibration(2, 4, [5, 3, 2])
        self.assertEqual(preview["dimensionsMeters"], [10, 6, 4])
        self.assertFalse(preview["appliedToModel"])
        self.assertFalse(preview["quantitiesEnabled"])
        with self.assertRaises(ValueError):
            preview_scale_calibration(0, 1, [1, 2, 3])
        with self.assertRaises(ValueError):
            preview_scale_calibration(1, 2, [1, float("inf"), 3])

    def test_opening_schedule_requires_review_and_calibration(self):
        wall = {"name": "Parede A", "suggestedClass": "wall",
                "bounds": {"min": [0, 0, 0], "max": [4, .2, 3]}}
        window = {"name": "Janela A", "suggestedClass": "window",
                  "bounds": {"min": [1, .1, 1], "max": [2, .3, 2]}}
        raw = draft_opening_schedule([wall, window])
        self.assertIsNone(raw[0]["dimensionsMeters"])
        self.assertFalse(raw[0]["approved"])
        calibrated = draft_opening_schedule([wall, window], 2)
        self.assertEqual(calibrated[0]["dimensionsMeters"]["approxWidth"], 2)
        self.assertEqual(calibrated[0]["dimensionsMeters"]["approxSillElevation"], 2)
        self.assertFalse(calibrated[0]["fabricationReady"])
        with self.assertRaises(ValueError):
            draft_opening_schedule([wall, window], 0)

    def test_wall_topology_does_not_claim_apertures(self):
        closed = evaluate_wall_mesh_topology(8, 12, 6, 0, 0)
        self.assertEqual(closed["topologyStatus"], "closed_surface_not_void_verified")
        self.assertFalse(closed["openingDetected"])
        open_wall = evaluate_wall_mesh_topology(8, 12, 5, 4, 0)
        self.assertEqual(open_wall["topologyStatus"], "open_surface_requires_review")
        self.assertFalse(open_wall["quantitiesEnabled"])
        broken = evaluate_wall_mesh_topology(8, 12, 5, 4, 2)
        self.assertEqual(broken["topologyStatus"], "nonmanifold_requires_review")
        with self.assertRaises(ValueError):
            evaluate_wall_mesh_topology(8, 4, 2, 5, 0)

    def test_boundary_loops_are_candidates_only(self):
        vertices = [[0, 0, 0], [2, 0, 0], [2, 0, 1], [0, 0, 1]]
        result = inspect_boundary_loops(vertices, [[0, 1], [1, 2], [2, 3], [3, 0]])
        self.assertEqual(len(result["closedBoundaryCandidates"]), 1)
        self.assertFalse(result["closedBoundaryCandidates"][0]["openingConfirmed"])
        self.assertEqual(result["closedBoundaryCandidates"][0]["bounds"]["max"], [2, 0, 1])
        self.assertEqual(inspect_boundary_loops(vertices, [[0, 1], [1, 2]])["closedBoundaryCandidates"], [])
        with self.assertRaises(ValueError):
            inspect_boundary_loops(vertices, [[0, 9]])

    def test_boundary_rejects_duplicates_and_invalid_limits(self):
        points = [[0, 0, 0], [1, 0, 0], [0, 0, 1]]
        with self.assertRaises(ValueError):
            inspect_boundary_loops(points, [[0, 1], [1, 0], [1, 2], [2, 0]])
        with self.assertRaises(ValueError):
            inspect_boundary_loops(points, [[0, 1]], max_edges=0)
        with self.assertRaises(ValueError):
            inspect_boundary_loops(points, [[0, 1]], max_edges=True)
        with self.assertRaises(ValueError):
            inspect_boundary_loops([[0, 0, 0]] * 200001, [])

    def test_boundary_frame_correspondence_is_never_approved(self):
        ring = {"bounds": {"min": [1, 0, 1], "max": [2, 0.2, 2]}}
        wall = {"name": "Parede", "suggestedClass": "wall",
                "bounds": {"min": [0, 0, 0], "max": [4, 0.2, 3]},
                "topologyReview": {"boundaryLoopReview": {"closedBoundaryCandidates": [ring]}}}
        frame = {"name": "Janela", "suggestedClass": "window",
                 "bounds": {"min": [1, 0.1, 1], "max": [2, 0.3, 2]}}
        relations = propose_opening_hosts([wall, frame])
        review = associate_boundary_candidates(relations, [wall, frame])
        self.assertEqual(review[0]["reviewPriority"], "boundary_and_object_overlap")
        self.assertEqual(len(review[0]["candidateBoundaryMatches"]), 1)
        self.assertFalse(review[0]["openingConfirmed"])
        self.assertFalse(review[0]["fabricationReady"])
        frame["bounds"] = {"min": [8, 8, 1], "max": [9, 9, 2]}
        far = associate_boundary_candidates(relations, [wall, frame])
        self.assertEqual(far[0]["reviewPriority"], "spatial_only")

    def test_boundary_matching_rejects_untrusted_topology(self):
        ring = {"bounds": {"min": [float("nan"), 0, 0], "max": [2, 1, 2]}}
        wall = {"name": "Parede", "suggestedClass": "wall",
                "topologyReview": {"boundaryLoopReview": {"closedBoundaryCandidates": [ring]}}}
        frame = {"name": "Janela", "suggestedClass": "window",
                 "bounds": {"min": [1, 0, 1], "max": [2, 1, 2]}}
        relation = [{"opening": "Janela", "candidateWalls": ["Parede"]}]
        output = associate_boundary_candidates(relation, [wall, frame])
        self.assertEqual(output[0]["candidateBoundaryMatches"], [])
        self.assertFalse(output[0]["openingConfirmed"])
        with self.assertRaises(ValueError):
            associate_boundary_candidates([None], [])
        with self.assertRaises(ValueError):
            associate_boundary_candidates([{}] * 2001, [])

    def test_exterior_wall_ring_does_not_raise_opening_priority(self):
        wall = {"name": "Parede", "suggestedClass": "wall",
                "bounds": {"min": [0, 0, 0], "max": [4, 0.2, 3]},
                "topologyReview": {"boundaryLoopReview": {"closedBoundaryCandidates": [
                    {"bounds": {"min": [0, 0, 0], "max": [4, 0.2, 3]}}
                ]}}}
        window = {"name": "Janela", "suggestedClass": "window",
                  "bounds": {"min": [1, 0, 1], "max": [2, 0.2, 2]}}
        relation = propose_opening_hosts([wall, window])
        review = associate_boundary_candidates(relation, [wall, window])
        self.assertEqual(review[0]["reviewPriority"], "spatial_only")
        self.assertEqual(review[0]["candidateBoundaryMatches"], [])
        self.assertFalse(review[0]["openingConfirmed"])

    def test_invalid_boundary_metadata_is_non_authoritative(self):
        opening = {"name": "Janela", "suggestedClass": "window",
                   "bounds": {"min": [1, 0, 1], "max": [2, .2, 2]}}
        for metadata in (None, "invalid", {"boundaryLoopReview": "broken"},
                         {"boundaryLoopReview": {"closedBoundaryCandidates": [None, "bad", {"bounds": None}]}}):
            wall = {"name": "Parede", "suggestedClass": "wall",
                    "bounds": {"min": [0, 0, 0], "max": [4, .2, 3]},
                    "topologyReview": metadata}
            relations = propose_opening_hosts([wall, opening])
            result = associate_boundary_candidates(relations, [wall, opening])
            self.assertEqual(result[0]["candidateBoundaryMatches"], [])
            self.assertFalse(result[0]["openingConfirmed"])

    def test_duplicate_window_names_never_produce_measured_schedule(self):
        wall = {"name": "Parede", "suggestedClass": "wall",
                "bounds": {"min": [0, 0, 0], "max": [5, .2, 3]}}
        first = {"name": "Janela", "suggestedClass": "window",
                 "bounds": {"min": [1, 0, 1], "max": [2, .2, 2]}}
        second = {"name": "Janela", "suggestedClass": "window",
                  "bounds": {"min": [3, 0, 1], "max": [4, .2, 2]}}
        records = draft_opening_schedule([wall, first, second], calibrated_scale=1)
        self.assertEqual(len(records), 2)
        for entry in records:
            self.assertEqual(entry["measurementStatus"], "ambiguous_object_name")
            self.assertEqual(entry["objectCountWithName"], 2)
            self.assertIsNone(entry["dimensionsMeters"])
            self.assertFalse(entry["fabricationReady"])

    def test_object_ids_disambiguate_same_named_windows(self):
        wall = {"name": "Parede", "objectId": "mesh-000000", "suggestedClass": "wall",
                "bounds": {"min": [0, 0, 0], "max": [5, .2, 3]}}
        first = {"name": "Janela", "objectId": "mesh-000001", "suggestedClass": "window",
                 "bounds": {"min": [1, 0, 1], "max": [2, .2, 2]}}
        second = {"name": "Janela", "objectId": "mesh-000002", "suggestedClass": "window",
                  "bounds": {"min": [3, 0, 1], "max": [4.5, .2, 2]}}
        rows = draft_opening_schedule([wall, first, second], calibrated_scale=1)
        self.assertEqual([r["objectId"] for r in rows], ["mesh-000001", "mesh-000002"])
        self.assertEqual([r["dimensionsMeters"]["approxWidth"] for r in rows], [1, 1.5])
        self.assertTrue(all(not r["approved"] and not r["fabricationReady"] for r in rows))
        ambiguous = draft_opening_schedule(
            [wall, {**first, "objectId": "duplicate"}, {**second, "objectId": "duplicate"}], 1)
        self.assertTrue(all(r["dimensionsMeters"] is None for r in ambiguous))

    def test_source_scoped_object_key_is_preserved_in_draft(self):
        digest = "ab" * 32
        wall = {"name": "Parede", "objectId": "mesh-000000",
                "sourceObjectKey": f"{digest}:mesh-000000", "suggestedClass": "wall",
                "bounds": {"min": [0, 0, 0], "max": [4, .2, 3]}}
        window = {"name": "Janela", "objectId": "mesh-000001",
                  "sourceObjectKey": f"{digest}:mesh-000001", "suggestedClass": "window",
                  "bounds": {"min": [1, 0, 1], "max": [2, .2, 2]}}
        hosts = propose_opening_hosts([wall, window])
        self.assertEqual(hosts[0]["sourceObjectKey"], window["sourceObjectKey"])
        schedule = draft_opening_schedule([wall, window])
        self.assertEqual(schedule[0]["sourceObjectKey"], window["sourceObjectKey"])
        self.assertFalse(schedule[0]["fabricationReady"])
        review = associate_boundary_candidates(hosts, [wall, window])
        self.assertEqual(review[0]["sourceObjectKey"], window["sourceObjectKey"])
        self.assertFalse(review[0]["openingConfirmed"])

    def test_identical_mesh_ids_from_two_sources_do_not_merge(self):
        a, b = "ab" * 32, "cd" * 32
        wall = {"name": "Parede", "objectId": "mesh-000000", "suggestedClass": "wall",
                "bounds": {"min": [0, 0, 0], "max": [5, .2, 3]}}
        first = {"name": "Janela", "objectId": "mesh-000001",
                 "sourceObjectKey": f"{a}:mesh-000001", "suggestedClass": "window",
                 "bounds": {"min": [1, 0, 1], "max": [2, .2, 2]}}
        second = {"name": "Janela", "objectId": "mesh-000001",
                  "sourceObjectKey": f"{b}:mesh-000001", "suggestedClass": "window",
                  "bounds": {"min": [2, 0, 1], "max": [4, .2, 2]}}
        rows = draft_opening_schedule([wall, first, second], calibrated_scale=1)
        self.assertEqual([r["sourceObjectKey"] for r in rows],
                         [first["sourceObjectKey"], second["sourceObjectKey"]])
        self.assertEqual([r["dimensionsMeters"]["approxWidth"] for r in rows], [1, 2])
        self.assertTrue(all(not r["fabricationReady"] for r in rows))

    def test_version_scoped_review_queue_rejects_cross_source_objects(self):
        digest = "ab" * 32
        row = {"opening": "Janela", "type": "window",
               "objectId": "mesh-000001", "sourceObjectKey": f"{digest}:mesh-000001",
               "measurementStatus": "aabb_estimate_requires_review",
               "hostRelationStatus": "single_spatial_candidate",
               "dimensionsMeters": {"approxWidth": 1.2}}
        result = create_opening_review_queue([row], digest, "R2")
        self.assertEqual(result["rows"][0]["reviewKey"], f"R2:{digest}:mesh-000001")
        self.assertFalse(result["rows"][0]["conflict"])
        self.assertFalse(result["rows"][0]["fabricationReady"])
        with self.assertRaises(ValueError):
            create_opening_review_queue([row], "cd" * 32, "R2")
        with self.assertRaises(ValueError):
            create_opening_review_queue([row, row], digest, "R2")
        with self.assertRaises(ValueError):
            create_opening_review_queue([row], digest, "")

    def test_opening_review_queue_prioritizes_conflicts(self):
        rows = [
            {"opening": "J1", "objectId": "m1", "hostRelationStatus": "single_spatial_candidate",
             "measurementStatus": "aabb_estimate_requires_review", "dimensionsMeters": None},
            {"opening": "J2", "objectId": "m2", "hostRelationStatus": "no_spatial_candidate",
             "measurementStatus": "ambiguous_object_name", "dimensionsMeters": None},
        ]
        review = [{"objectId": "m1", "candidateBoundaryMatches": [{"wall": "P1"}]}]
        queue = build_opening_review_queue(rows, review)
        self.assertEqual([item["objectId"] for item in queue], ["m2", "m1"])
        self.assertEqual(queue[0]["priority"], "high")
        self.assertEqual(queue[1]["priority"], "medium")
        self.assertFalse(queue[0]["approved"])
        self.assertFalse(queue[0]["fabricationReady"])
        with self.assertRaises(ValueError):
            build_opening_review_queue([None], [])

    def test_manual_review_decision_is_audit_proposal_only(self):
        digest = "ab" * 32
        row = {"sourceObjectKey": f"{digest}:mesh-000001",
               "objectId": "mesh-000001", "opening": "Janela",
               "measurementStatus": "aabb_estimate_requires_review",
               "hostRelationStatus": "single_spatial_candidate"}
        queue = create_opening_review_queue([row], digest, "R2")
        key = queue["rows"][0]["reviewKey"]
        result = record_opening_review_decision(
            queue, key, "arquiteta-01", "accept_for_detailed_review",
            "Conferir medidas em planta", "2026-10-09T19:00:00Z")
        self.assertFalse(result["persisted"])
        self.assertFalse(result["event"]["geometryApproved"])
        self.assertFalse(result["event"]["fabricationReady"])
        for decision, reason in (("approve_fabrication", "test"), ("reject_candidate", "")):
            with self.assertRaises(ValueError):
                record_opening_review_decision(
                    queue, key, "arquiteta-01", decision, reason, "2026-10-09T19:00:00Z")
        with self.assertRaises(ValueError):
            record_opening_review_decision(
                queue, "missing", "arquiteta-01", "reject_candidate", "test", "2026-10-09T19:00:00Z")

    def test_review_history_orders_events_and_preserves_approval_block(self):
        digest = "ab" * 32
        row = {"sourceObjectKey": f"{digest}:mesh-000001", "objectId": "mesh-000001",
               "opening": "Janela", "type": "window",
               "measurementStatus": "aabb_estimate_requires_review",
               "hostRelationStatus": "single_spatial_candidate"}
        queue = create_opening_review_queue([row], digest, "R2")
        key = queue["rows"][0]["reviewKey"]
        early = record_opening_review_decision(
            queue, key, "revisor-A", "request_information", "Conferir", "2026-10-09T18:00:00Z")["event"]
        late = record_opening_review_decision(
            queue, key, "revisor-B", "reject_candidate", "Não é vão", "2026-10-09T19:00:00Z")["event"]
        history = summarize_opening_review_history(queue, [late, early])
        self.assertEqual(history["rows"][0]["reviewStatus"], "rejected_candidate")
        self.assertEqual(history["rows"][0]["eventCount"], 2)
        self.assertFalse(history["rows"][0]["fabricationReady"])
        self.assertFalse(history["persisted"])
        with self.assertRaises(ValueError):
            summarize_opening_review_history(queue, [{**late, "sourceSha256": "cd" * 32}])
        with self.assertRaises(ValueError):
            summarize_opening_review_history(queue, [{**late, "reviewKey": "other"}])

    def test_review_dashboard_counts_conflicts_without_certifying(self):
        digest = "ab" * 32
        row = {"sourceObjectKey": f"{digest}:mesh-000001", "objectId": "mesh-000001",
               "opening": "Janela", "type": "window",
               "measurementStatus": "ambiguous_object_name",
               "hostRelationStatus": "ambiguous_spatial_candidates"}
        queue = create_opening_review_queue([row], digest, "R2")
        summary = summarize_opening_review_history(queue, [])
        dashboard = opening_review_dashboard(summary)
        self.assertEqual(dashboard["totalCandidates"], 1)
        self.assertEqual(dashboard["conflicts"], 1)
        self.assertEqual(dashboard["statuses"]["needs_manual_review"], 1)
        self.assertFalse(dashboard["fabricationReady"])
        with self.assertRaises(ValueError):
            opening_review_dashboard({"rows": [{**summary["rows"][0], "reviewStatus": "approved"}]})

    def test_bim_is_never_approved_from_manifest(self):
        data = bim_review_manifest("project-1", geometry_verified=True)
        self.assertFalse(data["quantitiesEnabled"])
        self.assertFalse(data["doorWindowScheduleApproved"])
        self.assertEqual(data["disciplines"]["electrical"], "pending_model_validation")


if __name__ == "__main__":
    unittest.main()
