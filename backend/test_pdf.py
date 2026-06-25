import httpx, base64

resp = httpx.get("https://export.arxiv.org/pdf/1706.03762", follow_redirects=True)
pdf_bytes = resp.content
pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')

with open("test.b64", "w") as f:
    f.write(pdf_b64)
