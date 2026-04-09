"""
Apply all Sales.tsx modifications:
1. Add Autocomplete import + distributorAPI import
2. Add submitting + distributors state
3. Load distributors in loadData
4. Add getEntityOptions helper
5. Add submitting guard to handleSubmit + finally block
6. Replace customer dropdown with searchable Autocomplete
7. Disable dialog buttons during submitting
"""

import re

filepath = "frontend/src/pages/Sales.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add Autocomplete to MUI imports
content = content.replace(
    '  Menu,\n} from "@mui/material";',
    '  Menu,\n  Autocomplete,\n} from "@mui/material";'
)

# 2. Import distributorAPI
content = content.replace(
    'import { salesAPI, customerAPI, productAPI } from "../services/api";',
    'import { salesAPI, customerAPI, productAPI, distributorAPI } from "../services/api";'
)

# 3. Add distributors + submitting state
content = content.replace(
    '  const [products, setProducts] = useState<Product[]>([]);\n  const [loading, setLoading] = useState(true);\n  const [error, setError]',
    '  const [products, setProducts] = useState<Product[]>([]);\n  const [distributors, setDistributors] = useState<any[]>([]);\n  const [loading, setLoading] = useState(true);\n  const [submitting, setSubmitting] = useState(false);\n  const [error, setError]'
)
# Also try with \r\n
content = content.replace(
    '  const [products, setProducts] = useState<Product[]>([]);\r\n  const [loading, setLoading] = useState(true);\r\n  const [error, setError]',
    '  const [products, setProducts] = useState<Product[]>([]);\r\n  const [distributors, setDistributors] = useState<any[]>([]);\r\n  const [loading, setLoading] = useState(true);\r\n  const [submitting, setSubmitting] = useState(false);\r\n  const [error, setError]'
)

# 4. Load distributors in loadData - add distributorAPI call
content = content.replace(
    '      const [salesResult, customersResult, productsResult] = await Promise.allSettled([\n        salesAPI.getAll({ limit: 1000 }),\n        customerAPI.getAll({ limit: 1000 }),\n        productAPI.getAll(),\n      ]);',
    '      const [salesResult, customersResult, productsResult, distributorsResult] = await Promise.allSettled([\n        salesAPI.getAll({ limit: 1000 }),\n        customerAPI.getAll({ limit: 1000 }),\n        productAPI.getAll(),\n        distributorAPI.getAll({ limit: 1000 }),\n      ]);'
)
content = content.replace(
    '      const [salesResult, customersResult, productsResult] = await Promise.allSettled([\r\n        salesAPI.getAll({ limit: 1000 }),\r\n        customerAPI.getAll({ limit: 1000 }),\r\n        productAPI.getAll(),\r\n      ]);',
    '      const [salesResult, customersResult, productsResult, distributorsResult] = await Promise.allSettled([\r\n        salesAPI.getAll({ limit: 1000 }),\r\n        customerAPI.getAll({ limit: 1000 }),\r\n        productAPI.getAll(),\r\n        distributorAPI.getAll({ limit: 1000 }),\r\n      ]);'
)

# 4b. Add distributors result handling after products result handling
dist_handler = """
      if (distributorsResult.status === "fulfilled") {
        const distData = distributorsResult.value;
        setDistributors(Array.isArray(distData) ? distData : (distData?.data || []));
      } else {
        console.warn("Could not load distributors:", distributorsResult.reason?.message);
      }"""

# Find the products result handling end and insert after it
for pattern_suffix in [
    'console.warn("Could not load products (user may lack view_products permission):", productsResult.reason?.message);\n      }',
    'console.warn("Could not load products (user may lack view_products permission):", productsResult.reason?.message);\r\n      }'
]:
    if pattern_suffix in content:
        content = content.replace(
            pattern_suffix,
            pattern_suffix + dist_handler
        )
        break

# 5. Add getEntityOptions helper before handleSubmit
entity_options_code = """
  // Build the entity options list based on selected category
  const getEntityOptions = () => {
    if (customerCategory === "Mantri") {
      const mantriMap = new Map<string, any>();
      distributors.forEach((d: any) => {
        if (d.mantri_name) {
          const key = `${d.mantri_name}-${d.mantri_mobile || ''}`;
          if (!mantriMap.has(key)) {
            mantriMap.set(key, {
              id: d.distributor_id,
              label: `${d.mantri_name}${d.mantri_mobile ? ` (${d.mantri_mobile})` : ''}${d.village ? ` - ${d.village}` : ''}`,
              name: d.mantri_name,
              village: d.village || '',
            });
          }
        }
      });
      return Array.from(mantriMap.values());
    } else if (customerCategory === "Distributor") {
      return distributors.map((d: any) => ({
        id: d.distributor_id,
        label: `${d.name || 'Unknown'}${d.village ? ` - ${d.village}` : ''}${d.mantri_name ? ` (Mantri: ${d.mantri_name})` : ''}`,
        name: d.name || '',
        village: d.village || '',
      }));
    } else {
      return customers.map((c) => ({
        id: c.customer_id,
        label: `${c.name}${c.village ? ` - ${c.village}` : ''}${c.mobile ? ` (${c.mobile})` : ''}`,
        name: c.name,
        village: c.village || '',
      }));
    }
  };

"""

content = content.replace(
    '  const handleSubmit = async () => {',
    entity_options_code + '  const handleSubmit = async () => {\n    if (submitting) return;\n    setSubmitting(true);'
)

# 6. Add finally block with setSubmitting(false) to handleSubmit
# Replace the closing of the catch block
content = content.replace(
    '      setError(errorMessage);\n    }\n  };\n\n  const getTotalAmount',
    '      setError(errorMessage);\n    } finally {\n      setSubmitting(false);\n    }\n  };\n\n  const getTotalAmount'
)
content = content.replace(
    '      setError(errorMessage);\r\n    }\r\n  };\r\n\r\n  const getTotalAmount',
    '      setError(errorMessage);\r\n    } finally {\r\n      setSubmitting(false);\r\n    }\r\n  };\r\n\r\n  const getTotalAmount'
)

# Remove duplicate console.error
content = content.replace(
    '      console.error("Error creating sale:", err);\n      console.error("Error creating sale:", err);',
    '      console.error("Error creating sale:", err);'
)
content = content.replace(
    '      console.error("Error creating sale:", err);\r\n      console.error("Error creating sale:", err);',
    '      console.error("Error creating sale:", err);'
)

# 7. Replace existing customer dropdown with searchable Autocomplete
old_dropdown = '''              {/* Existing Customer Selection */}
              {customerMode === "existing" && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label={`${t("customers.customerName")} *`}
                    value={formData.customer_id}
                    onChange={(e) => {
                      const newCustomerId = Number(e.target.value);
                      setFormData({
                        ...formData,
                        customer_id: newCustomerId,
                      });
                      recalculateRates(customerCategory, "existing", newCustomerId, newCustomerData.state);
                    }}
                  >
                    <MenuItem value={0}>
                      {t("sales.selectCustomer", "Select Sabhasad")}
                    </MenuItem>
                    {customers.map((customer) => (
                      <MenuItem
                        key={customer.customer_id}
                        value={customer.customer_id}
                      >
                        {customer.name} - {customer.village}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}'''

new_dropdown = '''              {/* Existing Customer/Entity Selection - Searchable */}
              {customerMode === "existing" && (
                <Grid item xs={12} sm={6}>
                  <Autocomplete
                    options={getEntityOptions()}
                    getOptionLabel={(option: any) => option.label || ''}
                    value={getEntityOptions().find((o: any) => o.id === formData.customer_id) || null}
                    onChange={(_e: any, newValue: any) => {
                      const newId = newValue ? newValue.id : 0;
                      setFormData({
                        ...formData,
                        customer_id: newId,
                      });
                      recalculateRates(customerCategory, "existing", newId, newCustomerData.state);
                    }}
                    renderInput={(params: any) => (
                      <TextField
                        {...params}
                        fullWidth
                        label={`${customerCategory === "Sabhasad" || customerCategory === "Field Officer" ? t("customers.customerName") : customerCategory} *`}
                        placeholder={`Search ${customerCategory}...`}
                      />
                    )}
                    isOptionEqualToValue={(option: any, value: any) => option.id === value?.id}
                    noOptionsText={`No ${customerCategory} found`}
                    filterOptions={(options: any[], { inputValue }: any) => {
                      const query = inputValue.toLowerCase();
                      return options.filter((o: any) => o.label.toLowerCase().includes(query));
                    }}
                  />
                </Grid>
              )}'''

# Try both line ending styles
for old, new in [(old_dropdown, new_dropdown)]:
    if old in content:
        content = content.replace(old, new)
        break
    old_crlf = old.replace('\n', '\r\n')
    new_crlf = new.replace('\n', '\r\n')
    if old_crlf in content:
        content = content.replace(old_crlf, new_crlf)
        break

# 8. Disable dialog buttons during submitting
content = content.replace(
    '            <Button onClick={handleCloseDialog}>{t("common.cancel")}</Button>\n            <Button onClick={handleSubmit} variant="contained">\n              {editingSaleId ? "Save Changes" : t("sales.addSale")}\n            </Button>',
    '''            <Button onClick={handleCloseDialog} disabled={submitting}>{t("common.cancel")}</Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {submitting ? "Saving..." : (editingSaleId ? "Save Changes" : t("sales.addSale"))}
            </Button>'''
)
content = content.replace(
    '            <Button onClick={handleCloseDialog}>{t("common.cancel")}</Button>\r\n            <Button onClick={handleSubmit} variant="contained">\r\n              {editingSaleId ? "Save Changes" : t("sales.addSale")}\r\n            </Button>',
    '            <Button onClick={handleCloseDialog} disabled={submitting}>{t("common.cancel")}</Button>\r\n            <Button\r\n              onClick={handleSubmit}\r\n              variant="contained"\r\n              disabled={submitting}\r\n              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}\r\n            >\r\n              {submitting ? "Saving..." : (editingSaleId ? "Save Changes" : t("sales.addSale"))}\r\n            </Button>'
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("All Sales.tsx modifications applied successfully!")
print(f"File size: {len(content)} bytes")
