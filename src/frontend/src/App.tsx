import './App.css';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { config } from "dotenv";
config()

interface CurrentPriceRow {
  photo_url?: string;
  group?: string;
  name?: string;
  quantity?: number;
  volume?: number;
  weight?: number;
  asda_url?: string;
  asda_price?: string;
  asda_multibuy_price?: string;
  asda_comment?: string;
  tesco_url?: string;
  tesco_price?: string;
  tesco_multibuy_price?: string;
  tesco_comment?: string;
}

const backendBaseUrl = process.env.BACKEND_BASE_URL;

function calculateUrl(product: CurrentPriceRow) {
  if (!product.tesco_price) { return product.asda_url }
  if (!product.asda_price) { return product.tesco_url }
  try {
    let asda = parseFloat(product.asda_price);
    if (product.asda_multibuy_price) {
      asda = parseFloat(product.asda_multibuy_price)
    }
    let tesco = parseFloat(product.tesco_price);
    if (product.tesco_multibuy_price) {
      asda = parseFloat(product.tesco_multibuy_price)
    }
    if (asda > tesco) {
      return product.tesco_url;
    } else {
      return product.asda_url;
    }
  } catch {
    return product.asda_url;
  }
}

function addPoundSign(price?: string) {
  return price && `£ ${price}`;
}

function App() {
  const [productList, setProductList] = useState<CurrentPriceRow[]>([]);

  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {

    axios.get(`${backendBaseUrl}/products`).then((result) => {
      setProductList(result.data);
    })
    
  },[]);

  return (
    <div className="App">
      <div>test</div>
      <table>
        <thead>
          <tr>
          <th>photo</th>
          <th>name</th>
          <th>quantity</th>
          <th>volume</th>
          <th>weight</th>
          <th>asda_price</th>
          <th>asda_m_p</th>
          <th>asda_comment</th>
          <th>tesco_price</th>
          <th>tesco_m_p</th>
          <th>tesco_comment</th>
          </tr>
        </thead>
        <tbody>
          {productList.map((product, i) => <tr key={i}>
            <td><img className="product-photo" src={product.photo_url} alt=""/></td>
            <td><a href={calculateUrl(product)}>{product.name}</a></td>
            <td>{product.quantity}</td>
            <td>{product.volume}</td>
            <td>{product.weight}</td>
            <td><a href={product.asda_url}>{addPoundSign(product.asda_price)}</a></td>
            <td>{addPoundSign(product.asda_multibuy_price)}</td>
            <td>{product.asda_comment}</td>
            <td><a href={product.tesco_url}>{addPoundSign(product.tesco_price)}</a></td>
            <td>{addPoundSign(product.tesco_multibuy_price)}</td>
            <td>{product.tesco_comment}</td>
        </tr>)}
        </tbody>
      </table>
      
    </div>
  );
}

export default App;
