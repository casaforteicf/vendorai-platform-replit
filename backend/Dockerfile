FROM python:3.11-slim

WORKDIR /app

# Copiar e instalar dependências
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código
COPY . .

# Expor porta
EXPOSE 8000

# Comando para rodar
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
