import { describe, expect, test } from "bun:test"

import {
  getPdfInputSupportFromMetadata,
  hasPdfAttachment,
  type AttachmentCapabilityModelMetadata,
} from "./attachmentCapabilities"

const metadata = (input?: string[], attachment?: boolean): AttachmentCapabilityModelMetadata => ({
  id: "model-a",
  providerId: "provider-a",
  name: "Model A",
  attachment,
  modalities: input ? { input, output: ["text"] } : undefined,
})

describe("attachment capability helpers", () => {
  test("detects PDF attachments by MIME type", () => {
    expect(hasPdfAttachment([{ mime: "application/pdf", filename: "document.bin" }])).toBe(true)
  })

  test("detects PDF attachments by filename when MIME is empty", () => {
    expect(hasPdfAttachment([{ mime: "", filename: "document.pdf" }])).toBe(true)
  })

  test("returns supported when input modalities include pdf", () => {
    expect(getPdfInputSupportFromMetadata(metadata(["text", "pdf"], false))).toBe("supported")
  })

  test("returns unsupported when explicit input modalities exclude pdf", () => {
    expect(getPdfInputSupportFromMetadata(metadata(["text", "image"], true))).toBe("unsupported")
  })

  test("returns unknown when metadata is missing", () => {
    expect(getPdfInputSupportFromMetadata(undefined)).toBe("unknown")
  })
})
