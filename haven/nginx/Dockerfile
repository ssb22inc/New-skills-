FROM nginx:1.25-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create SSL directory (certs will be mounted in production)
RUN mkdir -p /etc/nginx/ssl

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Run as non-root user
USER nginx

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
