import { Router } from "express";
import {
  resolveStoredUploadPath,
  storedUploadFolder,
  type StoredUploadArea,
} from "../lib/uploadStorage";

const router = Router();

router.get("/:area/:file", (req, res, next) => {
  const area = req.params.area as StoredUploadArea;
  if (!(area in storedUploadFolder))
    return res.status(404).json({ error: "Upload area not found" });
  try {
    return res.sendFile(
      resolveStoredUploadPath(area, req.params.file),
      { dotfiles: "deny" },
      (error) => {
        if (!error) return;
        if (!res.headersSent && (error as any).status === 404)
          res.status(404).json({ error: "File not found" });
        else next(error);
      },
    );
  } catch {
    return res.status(404).json({ error: "File not found" });
  }
});

export default router;
