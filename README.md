# DSC Academy

Trang đào tạo đầu tư của DSC: các khoá học là chuỗi bài viết ngắn, có quiz cuối bài, bài thi cuối khoá, chứng chỉ, thuật ngữ và phân quyền 3 tầng (Khách / Đã mở tài khoản / Đã eKYC).

Website tĩnh, tự build và deploy lên GitHub Pages mỗi lần đẩy code lên nhánh `main`.

## Cấu trúc

```
content/
  site.yaml              # tên site, lộ trình, bảng quyền lợi, link mở tài khoản
  modules.yaml           # danh sách khoá học
  glossary.yaml          # thuật ngữ
  khoa-hoc/<khoa-hoc>/   # mỗi bài viết là 1 file .md
  bai-thi/<khoa-hoc>.yaml
templates/               # giao diện (Jinja)
static/                  # CSS, JS, ảnh
build.py                 # tạo website vào thư mục dist/
```

## Thêm bài viết mới

Tạo file `content/khoa-hoc/<slug-khoa-hoc>/<số>-<tên>.md`:

```markdown
---
title: Tên bài viết
slug: ten-bai-viet
order: 13            # thứ tự trong khoá
minutes: 8           # thời gian đọc
tier: free           # free | acct (cần mở tài khoản) | ekyc
updated: 2026-10-12
description: Mô tả ngắn cho Google.
takeaways:
  - Ý chính 1
  - Ý chính 2
quiz:
  - q: Câu hỏi?
    options: ["Đáp án A", "Đáp án B", "Đáp án C"]   # luôn đặt trong ngoặc kép
    answer: 1                                        # vị trí đáp án đúng, bắt đầu từ 0
    explain: Giải thích hiện khi trả lời đúng.
---

Nội dung bài viết bằng Markdown. Mỗi tiêu đề `##` tự vào Mục lục.

Gắn thuật ngữ: [[NIM]] hoặc [[chữ hiển thị|Tên thuật ngữ]] (thuật ngữ phải có trong glossary.yaml).
```

Component tương tác chèn bằng một dòng HTML trong bài:

| Component | Mã chèn |
|---|---|
| Sơ đồ truyền dẫn lãi suất | `<div data-component="chain"></div>` |
| Thanh kéo mô phỏng lãi suất | `<div data-component="rate-sim" data-debt="4000" data-rate="10" data-ebt="800"></div>` |
| Bài tập phân loại ngành | `<div data-component="sector-sort"></div>` |
| Biểu đồ dữ liệu (khoá eKYC) | `<div data-component="live-rate"></div>` |

## Huy hiệu và điểm

Huy hiệu khai báo trong `content/badges.yaml` (tên, mô tả, điều kiện `rule`, điểm, màu và ký hiệu `art`). Khi build, mỗi huy hiệu được tạo hình SVG, ảnh chia sẻ 1200×630 và trang `/huy-hieu/<id>/` có nút chia sẻ Facebook, LinkedIn.

- Điểm: 10 điểm mỗi bài viết hoàn thành, +5 nếu đúng hết quiz ngay lần đầu, cộng điểm của từng huy hiệu.
- Khách vẫn đạt huy hiệu nhưng ở dạng "đang chờ"; đăng nhập để nhận và lưu tiến độ.
- Điều kiện hỗ trợ: `articles`, `module`, `quiz_first`, `exam_perfect`, `streak`, `terms`, `explore`, `night_owl` (xem chú thích đầu file badges.yaml).
- Chỉ thưởng cho việc học, không gắn với hành vi giao dịch.

Thêm khoá học mới: thêm mục vào `modules.yaml` và tạo thư mục `content/khoa-hoc/<slug>/`. Khoá chưa có thư mục sẽ hiển thị "Sắp ra mắt".

## Chạy thử trên máy

```bash
pip install -r requirements.txt
python build.py
cd dist && python -m http.server 8000   # rồi build lại với BASE_PATH="" để xem tại http://localhost:8000
```

Build cho tên miền riêng: `BASE_PATH="" SITE_URL="https://academy.dsc.vn" python build.py`.

## Lưu ý về bản demo

GitHub Pages chỉ chạy web tĩnh, nên:

- **Đăng nhập và phân quyền được giả lập.** Nút "Demo" góc phải dưới cho phép đổi vai trò. Nội dung bài khoá vẫn nằm trong HTML; bản chính thức cần server kiểm tra quyền (SSO tài khoản giao dịch DSC) trước khi trả nội dung.
- **Tiến độ, kết quả quiz, chứng chỉ lưu trong trình duyệt** (localStorage), không đồng bộ giữa thiết bị.
- Mã QR, link mở tài khoản (`open_account_url` trong `site.yaml`) và biểu đồ dữ liệu đang là bản minh hoạ.

Nội dung DSC Academy chỉ nhằm mục đích giáo dục, không phải khuyến nghị đầu tư.
