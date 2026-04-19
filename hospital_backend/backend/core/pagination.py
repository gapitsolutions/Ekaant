def paginate_queryset(queryset, page: int, page_size: int):
    safe_page = max(page, 1)
    safe_page_size = min(max(page_size, 1), 200)
    total = queryset.count()
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size

    return queryset[start:end], {
        "page": safe_page,
        "pageSize": safe_page_size,
        "total": total,
    }
